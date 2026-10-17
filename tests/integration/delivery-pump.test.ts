/**
 * Интеграционные тесты насоса доставки.
 *
 * Насос — единственный слой, который реально отправляет манифест экрану:
 * обработчики маршрутов Next живут в другой изоляции процесса и реестра
 * сокетов не видят. Поэтому его решения проверяются здесь на настоящей
 * базе и настоящем реестре, а не на моках: главное свойство насоса —
 * не выдавать «отправлено» экрану, с которым нечем говорить.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { WebSocket } from 'ws'

import { db, sqlite } from '@/db/client'
import {
  branches,
  companies,
  deliveryReceipts,
  mediaAssets,
  playlistVersionItems,
  playlistVersions,
  playlists,
  releaseAssignments,
  releases,
  screens,
  users,
} from '@/db/schema'
import { deliverySummary, publishCompany } from '@/server/services/release-service'
import { runDeliveryPumpOnce } from '@/server/ws/delivery-pump'
import { deviceHub, type DeviceConnection } from '@/server/ws/hub'

const COMPANY = 'cmp_pump'
const BRANCH = 'brn_pump'
const SCREEN_ONLINE = 'scr_pump_online'
const SCREEN_OFFLINE = 'scr_pump_offline'
const OWNER = 'usr_pump_owner'

/** Сокет, который только запоминает отправленные кадры. */
function fakeSocket() {
  const frames: string[] = []
  const socket = {
    OPEN: 1,
    readyState: 1,
    send(payload: string) {
      frames.push((JSON.parse(payload) as { type: string }).type)
    },
    close() {},
    terminate() {},
  }

  return { socket: socket as unknown as WebSocket, frames }
}

function fakeConnection(socket: WebSocket, screenId: string | null, companyId: string): DeviceConnection {
  return {
    socket,
    screenId,
    companyId,
    deviceId: screenId,
    watchedPairingSessionId: null,
    isAlive: true,
    connectedAt: Date.now(),
  }
}

function wipeAllTables() {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all() as { name: string }[]

  sqlite.pragma('foreign_keys = OFF')
  for (const row of rows) {
    sqlite.exec(`DELETE FROM "${row.name}"`)
  }
  sqlite.pragma('foreign_keys = ON')
}

/**
 * Компания с двумя экранами, одним назначением и одним готовым материалом.
 *
 * Один экран на связи, второй — нет: именно различие между ними и есть
 * поведение, которое насос обязан различать.
 */
function seedFixture() {
  const now = new Date()

  db.insert(users)
    .values({ id: OWNER, email: 'pump@test.local', passwordHash: 'x', name: 'Владелец' })
    .run()

  db.insert(companies).values({ id: COMPANY, slug: 'pump', name: 'Насос' }).run()

  db.insert(branches).values({ id: BRANCH, companyId: COMPANY, name: 'Филиал' }).run()

  for (const [id, name, lastSeenAt] of [
    [SCREEN_ONLINE, 'Экран на связи', now],
    // Экран без соединения обязан иметь и просроченный heartbeat: иначе
    // «нет связи» в сводке считалось бы по чеку, а не по факту связи,
    // и проверки сумм чисел врали бы.
    [SCREEN_OFFLINE, 'Экран без связи', new Date(now.getTime() - 60 * 60_000)],
  ] as const) {
    db.insert(screens)
      .values({
        id,
        companyId: COMPANY,
        branchId: BRANCH,
        name,
        status: 'paired',
        lastSeenAt,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }

  db.insert(mediaAssets)
    .values({
      id: 'ast_pump',
      companyId: COMPANY,
      sha256: 'a'.repeat(64),
      kind: 'image',
      state: 'ready',
      mime: 'image/png',
      bytes: 1024,
      durationMs: 5000,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  db.insert(playlists)
    .values({ id: 'pls_pump', companyId: COMPANY, name: 'Основной', createdAt: now, updatedAt: now })
    .run()

  db.insert(playlistVersions)
    .values({
      id: 'pvr_pump',
      playlistId: 'pls_pump',
      version: 1,
      totalDurationMs: 5000,
      createdAt: now,
    })
    .run()

  db.insert(playlistVersionItems)
    .values({
      id: 'pvi_pump',
      versionId: 'pvr_pump',
      position: 1,
      mediaAssetId: 'ast_pump',
      durationMs: 5000,
      playPolicy: 'loop_once',
      transition: 'none',
      audio: 'keep',
    })
    .run()

  db.insert(releaseAssignments)
    .values({
      id: 'asg_pump',
      companyId: COMPANY,
      scopeType: 'company',
      scopeId: COMPANY,
      playlistVersionId: 'pvr_pump',
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

function receiptFor(screenId: string) {
  return db
    .select()
    .from(deliveryReceipts)
    .where(eq(deliveryReceipts.screenId, screenId))
    .get()
}

let connection: DeviceConnection | null = null
const online = fakeSocket()

beforeEach(() => {
  wipeAllTables()
  seedFixture()

  connection = fakeConnection(online.socket, SCREEN_ONLINE, COMPANY)
  deviceHub.add(connection)
  deviceHub.bindScreen(connection, SCREEN_ONLINE, COMPANY, SCREEN_ONLINE)
})

afterEach(() => {
  if (connection) deviceHub.remove(connection)
  connection = null
  deviceHub.closeAll()
  online.frames.length = 0
})

describe('насос доставки', () => {
  it('отправляет манифест экрану на связи и переводит чек в «отправлено»', () => {
    const published = publishCompany(COMPANY, OWNER)

    runDeliveryPumpOnce()

    expect(online.frames).toContain('assignment')

    const receipt = receiptFor(SCREEN_ONLINE)
    expect(receipt?.state).toBe('sent')
    expect(receipt?.attempts).toBe(1)
    expect(receipt?.sentAt).not.toBeNull()
    expect(published.screens).toBe(2)
  })

  it('не считает экран без соединения отправленным: он остаётся в очереди', () => {
    publishCompany(COMPANY, OWNER)

    runDeliveryPumpOnce()

    const receipt = receiptFor(SCREEN_OFFLINE)
    expect(receipt?.state).toBe('queued')
    expect(receipt?.sentAt).toBeNull()
  })

  it('не досылает опубликованное повторно, пока подтверждения не было', () => {
    publishCompany(COMPANY, OWNER)

    runDeliveryPumpOnce()
    const afterFirst = online.frames.length
    runDeliveryPumpOnce()

    // Повторная отправка разрешена только через RESEND_AFTER_MS; в пределах
    // окна второй тик не должен слать кадр заново.
    expect(online.frames.length).toBe(afterFirst)
    expect(receiptFor(SCREEN_ONLINE)?.attempts).toBe(1)
  })

  it('досылает манифест повторно, если подтверждения долго нет', () => {
    publishCompany(COMPANY, OWNER)
    runDeliveryPumpOnce()

    // Отматываем время чека назад за пределы окна повторной отправки:
    // так проверяется сама логика «прошло достаточно времени», а не ожидание.
    const old = new Date(Date.now() - 10 * 60_000)

    db.update(deliveryReceipts)
      .set({ updatedAt: old })
      .where(eq(deliveryReceipts.screenId, SCREEN_ONLINE))
      .run()

    const before = online.frames.length
    runDeliveryPumpOnce()

    expect(online.frames.length).toBeGreaterThan(before)
    expect(receiptFor(SCREEN_ONLINE)?.attempts).toBe(2)
    expect(receiptFor(SCREEN_ONLINE)?.state).toBe('sent')
  })

  it('прекращает доставку и признаёт отказ, когда подтверждения так и нет', () => {
    const published = publishCompany(COMPANY, OWNER)

    db.update(deliveryReceipts)
      .set({ attempts: 99, updatedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(deliveryReceipts.screenId, SCREEN_ONLINE))
      .run()

    const before = online.frames.length
    runDeliveryPumpOnce()

    const receipt = receiptFor(SCREEN_ONLINE)
    expect(receipt?.state).toBe('failed')
    expect(receipt?.errorCode).toBe('no_ack')
    expect(online.frames.length).toBe(before)

    // Отказ не должен попадать ни в «отправлено», ни в «загружают»:
    // экран на связи, но публикацию не применил.
    const summary = deliverySummary(COMPANY, published.releaseId)
    expect(summary.failed).toBe(1)
    expect(summary.sent).toBe(0)
    expect(summary.applied).toBe(0)
    expect(summary.downloading).toBe(0)

    // Второй экран без связи — честно «нет связи», и вместе с отказом
    // исчерпывает все чеки публикации: ни один экран не пропадает из счёта.
    expect(summary.noContact).toBe(1)
    expect(summary.total).toBe(2)
  })

  it('не трогает чеки уже применённой публикации', () => {
    const published = publishCompany(COMPANY, OWNER)

    db.update(deliveryReceipts)
      .set({ state: 'applied', ackedAt: new Date(), updatedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(deliveryReceipts.screenId, SCREEN_ONLINE))
      .run()

    const before = online.frames.length
    runDeliveryPumpOnce()

    expect(online.frames.length).toBe(before)
    expect(receiptFor(SCREEN_ONLINE)?.state).toBe('applied')
    expect(db.select().from(releases).all()).toHaveLength(1)
    expect(published.screens).toBe(2)
  })
})