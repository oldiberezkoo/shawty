import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'
import { and, eq } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import {
  deliveryReceipts,
  pairingSessions,
  playerErrors,
  releases,
  screenPublications,
  screens,
} from '@/db/schema'
import { hashSecret, safeEqual } from '@/lib/crypto'
import { serverConfig } from '@/config/server'
import { authenticateAccessToken, type DeviceIdentity } from '@/server/services/device-service'
import { logger } from '@/lib/logger'
import { deviceHub, type DeviceConnection } from './hub'
import { deviceFrameSchema, encodeFrame, type ServerFrame } from './protocol'

function send(connection: DeviceConnection, frame: ServerFrame): void {
  if (connection.socket.readyState !== connection.socket.OPEN) return
  connection.socket.send(encodeFrame(frame))
}

function deny(
  connection: DeviceConnection,
  code: Extract<ServerFrame, { type: 'hello.denied' }>['code'],
  message: string,
  reauth: boolean,
): void {
  send(connection, { type: 'hello.denied', code, message, reauth })
  // 4401 — приватный код для «сними учётные данные и перепривяжись».
  connection.socket.close(4401, code)
}

export function handleDeviceConnection(socket: WebSocket, request: IncomingMessage): void {
  const connection: DeviceConnection = {
    socket,
    screenId: null,
    companyId: null,
    deviceId: null,
    watchedPairingSessionId: null,
    isAlive: true,
    connectedAt: Date.now(),
  }

  deviceHub.add(connection)

  socket.on('pong', () => {
    connection.isAlive = true
  })

  socket.on('message', (raw) => {
    let payload: unknown
    try {
      payload = JSON.parse(String(raw))
    } catch {
      send(connection, { type: 'hello.denied', code: 'unauthorized', message: 'Некорректный кадр', reauth: false })
      return
    }

    const parsed = deviceFrameSchema.safeParse(payload)
    if (!parsed.success) {
      logger.debug({ issues: parsed.error.issues.length }, 'отброшен кадр неизвестной формы')
      return
    }

    const frame = parsed.data

    try {
      switch (frame.type) {
        case 'hello':
          handleHello(connection, frame.accessToken)
          break

        case 'pong':
          connection.isAlive = true
          break

        case 'watch-pairing':
          handleWatchPairing(connection, frame.sessionId, frame.deviceNonce)
          break

        case 'heartbeat':
          if (!connection.screenId) {
            deny(connection, 'unauthorized', 'Сначала кадр hello', false)
            return
          }
          handleHeartbeat(connection, frame)
          break

        case 'applied':
          if (!connection.screenId) return
          handleApplied(connection, frame.releaseVersion)
          break

        case 'player.error':
          if (!connection.screenId || !connection.companyId) return
          insertPlayerError(connection, frame.code, frame.message)
          break
      }
    } catch (error) {
      logger.warn({ err: error }, 'ошибка при обработке кадра устройства')
    }
  })

  socket.on('close', () => {
    deviceHub.remove(connection)
  })

  socket.on('error', (error) => {
    logger.debug({ err: error }, 'ошибка сокета устройства')
    deviceHub.remove(connection)
  })

  logger.debug({ ip: request.socket.remoteAddress }, 'устройство подключилось к каналу')
}

function handleHello(connection: DeviceConnection, accessToken: string): void {
  let identity: DeviceIdentity
  try {
    identity = authenticateAccessToken(accessToken)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Отказано'
    // Различаем «нужна повторная привязка» и «временно нет прав»:
    // телевизор стирает локальные данные только в первом случае.
    const reauth = message.includes('повторная привязка') || message.includes('отвязано')
    const code = reauth ? 'unpaired' : message.includes('отключён') ? 'disabled' : 'unauthorized'
    deny(connection, code, message, reauth)
    return
  }

  deviceHub.bindScreen(connection, identity.screenId, identity.companyId, identity.deviceId)

  const now = new Date()
  db.update(screens).set({ lastSeenAt: now, updatedAt: now }).where(eq(screens.id, identity.screenId)).run()

  send(connection, {
    type: 'hello.ok',
    deviceId: identity.deviceId,
    screenId: identity.screenId,
    companyId: identity.companyId,
    heartbeatSec: serverConfig.player.heartbeatSec,
  })
}

/**
 * Подписка на привязку. Обязательна проверка nonce: sessionId виден в QR,
 * и без этой проверки одноразовый токен выдачи получил бы любой, кто посмотрел
 * на экран во время подтверждения.
 */
function handleWatchPairing(connection: DeviceConnection, sessionId: string, deviceNonce: string): void {
  const row = db.select().from(pairingSessions).where(eq(pairingSessions.id, sessionId)).get()
  if (!row) {
    send(connection, { type: 'pairing.expired' })
    return
  }

  const nonceOk = safeEqual(hashSecret(`${sessionId}:${deviceNonce}`), row.deviceNonceHash)
  if (!nonceOk) {
    logger.warn({ sessionId }, 'попытка подписаться на чужую сессию привязки')
    send(connection, { type: 'pairing.expired' })
    return
  }

  deviceHub.watchPairing(connection, sessionId)

  // Если подтверждение уже произошло, пока сокет поднимался, сообщаем сразу:
  // иначе телевизор ждал бы до конца пяти минут впустую.
  if (row.status === 'confirmed') {
    logger.debug({ sessionId }, 'привязка уже подтверждена, ожидаем обмена токеном')
  }
}

function handleHeartbeat(
  connection: DeviceConnection,
  frame: {
    playerVersion?: string
    appliedVersion?: number | null
    storage?: { usageBytes?: number; quotaBytes?: number } | undefined
    capabilities?: Record<string, unknown> | undefined
  },
): void {
  const screenId = connection.screenId
  if (!screenId) return

  const now = new Date()

  const update: Partial<typeof screens.$inferInsert> = { lastSeenAt: now, updatedAt: now }
  if (frame.playerVersion) update.playerVersion = frame.playerVersion
  if (frame.capabilities) update.capabilitiesJson = JSON.stringify(frame.capabilities)

  db.update(screens).set(update).where(eq(screens.id, screenId)).run()

  logger.debug(
    { screenId, version: frame.playerVersion, applied: frame.appliedVersion },
    'heartbeat устройства',
  )
}

/**
 * Подтверждение применения публикации.
 *
 * Событие означает, что плеер не просто получил кадр, а записал манифест
 * в локальный кеш и переключился на него. Именно по нему в панели считается
 * число «применили».
 */
function handleApplied(connection: DeviceConnection, releaseVersion: number): void {
  const screenId = connection.screenId
  const companyId = connection.companyId
  if (!screenId || !companyId) return

  const now = new Date()

  withImmediateTransaction((tx) => {
    const release = tx
      .select({ id: releases.id, manifestVersion: releases.manifestVersion })
      .from(releases)
      .where(and(eq(releases.companyId, companyId), eq(releases.manifestVersion, releaseVersion)))
      .get()

    if (!release) return

    tx.update(screenPublications)
      .set({
        appliedReleaseId: release.id,
        appliedVersion: release.manifestVersion,
        appliedAt: now,
        updatedAt: now,
      })
      .where(eq(screenPublications.screenId, screenId))
      .run()

    tx.update(deliveryReceipts)
      .set({ state: 'applied', ackedAt: now, updatedAt: now, playerVersion: null })
      .where(and(eq(deliveryReceipts.releaseId, release.id), eq(deliveryReceipts.screenId, screenId)))
      .run()
  })

  logger.debug({ screenId, releaseVersion }, 'плеер применил публикацию')
}

function insertPlayerError(connection: DeviceConnection, code: string, message: string): void {
  const screenId = connection.screenId
  const companyId = connection.companyId
  if (!screenId || !companyId) return

  db.insert(playerErrors)
    .values({
      id: crypto.randomUUID(),
      screenId,
      companyId,
      code: code.slice(0, 64),
      message: message.slice(0, 2000),
      at: new Date(),
    })
    .run()

  logger.warn({ screenId, code }, 'ошибка воспроизведения на устройстве')
}
