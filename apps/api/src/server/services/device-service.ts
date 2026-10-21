import { and, eq, isNull } from 'drizzle-orm'
import { createHmac } from 'node:crypto'
import { db } from '@/db/client'
import { deviceCredentials, screens } from '@/db/schema'
import { hashSecret, safeEqual } from '@/lib/crypto'
import { randomDeviceSecret } from '@/lib/ids'
import { signJwt, verifyJwt } from '@/lib/jwt'
import { loadOrCreateSecret } from '@/lib/secret-store'
import { serverConfig } from '@/config/server'
import { HttpError } from '@/server/http/errors'
import { recordEventIncident } from '@/server/services/incident-service'
import { recordAudit } from '@/server/services/audit-service'

/**
 * Секрет подписи токенов устройств выводится из серверного секрета.
 * Благодаря этому ротация основного секрета не отзывает все устройства разом,
 * а компрометация подписи устройств не раскрывает хеши кодов привязки.
 */
function deviceJwtSecret(): string {
  return createHmac('sha256', loadOrCreateSecret()).update('device-access-token').digest('hex')
}

export type DeviceIdentity = {
  deviceId: string
  screenId: string
  companyId: string
  credentialId: string
  credentialVersion: number
}

export type AccessTokenResult = {
  accessToken: string
  expiresAt: Date
  identity: DeviceIdentity
}

type CredentialRow = typeof deviceCredentials.$inferSelect
type ScreenRow = typeof screens.$inferSelect

/**
 * Проверка постоянного секрета устройства.
 *
 * Секрет в базе не хранится — только HMAC. Поэтому подстановка чужого
 * deviceId бесполезна: без настоящего секрета хеш не совпадёт.
 */
function verifyCredential(credential: CredentialRow, deviceSecret: string): boolean {
  return safeEqual(hashSecret(deviceSecret), credential.secretHash)
}

function isCredentialUsable(credential: CredentialRow, now: Date): boolean {
  if (credential.revokedAt) return false
  if (credential.expiresAt && credential.expiresAt.getTime() <= now.getTime()) return false
  return true
}

/** Обмен постоянного секрета на короткоживущий токен доступа. */
export function issueAccessToken(deviceId: string, deviceSecret: string): AccessTokenResult {
  const now = new Date()

  const row = db
    .select({ credential: deviceCredentials, screen: screens })
    .from(deviceCredentials)
    .innerJoin(screens, eq(screens.id, deviceCredentials.screenId))
    .where(eq(deviceCredentials.deviceId, deviceId))
    .get()

  // Явная проверка каждой причины нужна для корректного кода ответа.
  const credential = row?.credential
  const screen = row?.screen

  if (!credential || !screen) {
    throw HttpError.unauthorized('Неизвестное устройство')
  }
  if (credential.revokedAt) {
    throw HttpError.forbidden('Доступ устройства отозван')
  }
  if (screen.status === 'revoked') {
    throw HttpError.forbidden('Устройство отвязано')
  }
  if (screen.status === 'disabled') {
    throw HttpError.forbidden('Экран отключён администратором')
  }
  if (screen.status === 'unpaired') {
    throw HttpError.forbidden('Требуется повторная привязка')
  }
  if (credential.expiresAt && credential.expiresAt.getTime() <= now.getTime()) {
    throw HttpError.forbidden('Срок действия устройства истёк')
  }
  if (!verifyCredential(credential, deviceSecret)) {
    throw HttpError.unauthorized('Неверные учётные данные устройства')
  }

  const identity: DeviceIdentity = {
    deviceId: credential.deviceId,
    screenId: screen.id,
    companyId: screen.companyId,
    credentialId: credential.id,
    credentialVersion: credential.version,
  }

  const ttl = serverConfig.device.accessTokenTtlMs

  const signed = signJwt(
    { sub: identity.deviceId, screen: identity.screenId, company: identity.companyId, cv: identity.credentialVersion, typ: 'device' },
    deviceJwtSecret(),
    ttl,
  )

  db.update(deviceCredentials).set({ lastUsedAt: now }).where(eq(deviceCredentials.id, credential.id)).run()

  return { accessToken: signed.token, expiresAt: signed.expiresAt, identity }
}

/**
 * Проверка токена доступа с привязкой к текущему состоянию устройства.
 *
 * Версия учётных данных в токене обязана совпадать с текущей: рост версии при
 * ротации или отзыве мгновенно обесценивает все ранее выданные токены, и
 * отозванное устройство не может продолжать работать со старым токеном.
 */
export function authenticateAccessToken(token: string): DeviceIdentity {
  const verified = verifyJwt(token, deviceJwtSecret())
  if (!verified.ok) {
    throw HttpError.unauthorized('Токен устройства недействителен или истёк')
  }

  const payload = verified.payload
  const now = new Date()

  const row = db
    .select({ credential: deviceCredentials, screen: screens })
    .from(deviceCredentials)
    .innerJoin(screens, eq(screens.id, deviceCredentials.screenId))
    .where(eq(deviceCredentials.deviceId, payload.sub))
    .get()

  const credential = row?.credential
  const screen = row?.screen

  if (!credential || !screen) throw HttpError.unauthorized('Устройство не найдено')
  if (credential.version !== payload.cv) {
    throw HttpError.unauthorized('Токен устройства отозван: требуется обмен по новому секрету')
  }
  if (!isCredentialUsable(credential, now)) {
    throw HttpError.forbidden('Доступ устройства отозван')
  }
  if (screen.status === 'revoked') throw HttpError.forbidden('Устройство отвязано')
  if (screen.status === 'disabled') throw HttpError.forbidden('Экран отключён администратором')
  if (screen.status === 'unpaired') throw HttpError.forbidden('Требуется повторная привязка')
  if (credential.screenId !== payload.screen || screen.id !== payload.screen) {
    throw HttpError.unauthorized('Токен не соответствует устройству')
  }

  return {
    deviceId: credential.deviceId,
    screenId: screen.id,
    companyId: screen.companyId,
    credentialId: credential.id,
    credentialVersion: credential.version,
  }
}

/** Отзыв доступа: экран перестаёт работать, а телевизор должен стереть секрет. */
export function revokeDeviceAccess(screenId: string, now = new Date()): void {
  db.update(deviceCredentials)
    .set({ revokedAt: now })
    .where(and(eq(deviceCredentials.screenId, screenId), isNull(deviceCredentials.revokedAt)))
    .run()
}

/**
 * Ротация секрета без визита к телевизору.
 *
 * Устройство подтверждено действующим access-токеном, который привязан к
 * текущей версии учётных данных. Ротация повышает версию, поэтому все ранее
 * выданные токены мгновенно перестают работать, а старый секрет больше не
 * проходит проверку. Новый секрет возвращается один раз и нигде не хранится.
 */
export function rotateDeviceSecret(identity: DeviceIdentity): { deviceSecret: string; version: number } {
  const now = new Date()

  return db.transaction((tx) => {
    const nextVersion = identity.credentialVersion + 1
    const deviceSecret = randomDeviceSecret()

    const updated = tx
      .update(deviceCredentials)
      .set({ secretHash: hashSecret(deviceSecret), version: nextVersion, issuedAt: now, rotationPending: false })
      .where(
        and(
          eq(deviceCredentials.id, identity.credentialId),
          eq(deviceCredentials.version, identity.credentialVersion),
        ),
      )
      .run()

    if (updated.changes !== 1) {
      throw HttpError.conflict('rotate_race', 'Учётные данные уже изменились, повторите ротацию')
    }

    tx.update(screens).set({ updatedAt: now }).where(eq(screens.id, identity.screenId)).run()

    return { deviceSecret, version: nextVersion }
  })
}

/**
 * Отключение, включение, отвязка и ротация.
 *
 * Запись в журнал действий живёт здесь, а не в маршруте, и это не стилистическое
 * решение. Отвязка и ротация секрета — самые чувствительные операции в
 * продукте, и вызывающий код просто обязан не суметь про них забыть: иначе
 * отвязка из скрипта или из будущего маршрута прошла бы без следа, а журнал
 * выглядел бы полным. Поэтому исполнитель передаётся параметром, и запись
 * неотделима от действия.
 */
export function disableScreen(screenId: string, actorUserId?: string | null): void {
  const companyId = screenCompanyId(screenId)

  db.update(screens).set({ status: 'disabled', updatedAt: new Date() }).where(eq(screens.id, screenId)).run()

  if (companyId) {
    recordAudit({
      companyId,
      actorUserId,
      action: 'screen.disabled',
      targetType: 'screen',
      targetId: screenId,
      meta: { name: screenNameOf(screenId) },
    })
  }
}

export function enableScreen(screenId: string, actorUserId?: string | null): void {
  const companyId = screenCompanyId(screenId)

  db.update(screens).set({ status: 'paired', updatedAt: new Date() }).where(eq(screens.id, screenId)).run()

  if (companyId) {
    recordAudit({
      companyId,
      actorUserId,
      action: 'screen.enabled',
      targetType: 'screen',
      targetId: screenId,
      meta: { name: screenNameOf(screenId) },
    })
  }
}

/** Полная отвязка: доверие снято, привязка потребуется заново. */
export function unpairScreen(screenId: string, now = new Date(), actorUserId?: string | null): void {
  const companyId = screenCompanyId(screenId)
  const screenName = screenNameOf(screenId)

  db.transaction((tx) => {
    tx.update(deviceCredentials)
      .set({ revokedAt: now })
      .where(and(eq(deviceCredentials.screenId, screenId), isNull(deviceCredentials.revokedAt)))
      .run()
    tx.update(screens).set({ status: 'revoked', updatedAt: now }).where(eq(screens.id, screenId)).run()
  })

  // Событие в ленту сразу, а не на следующем тике насоса: человек только что
  // отвязал экран, и пустая лента в этот момент выглядит как потеря события.
  if (companyId) {
    recordEventIncident({
      screenId,
      companyId,
      type: 'revoked',
      detail: 'Доступ отозван администратором',
      now,
    })

    recordAudit({
      companyId,
      actorUserId,
      action: 'screen.unpaired',
      targetType: 'screen',
      targetId: screenId,
      meta: { name: screenName },
      at: now,
    })
  }
}

/** Запрос ротации секрета: экран должен быть на связи, чтобы подтвердить смену. */
export function requestRotation(screenId: string, actorUserId?: string | null): { pending: boolean } {
  const companyId = screenCompanyId(screenId)

  db.update(deviceCredentials)
    .set({ rotationPending: true })
    .where(and(eq(deviceCredentials.screenId, screenId), isNull(deviceCredentials.revokedAt)))
    .run()

  if (companyId) {
    recordAudit({
      companyId,
      actorUserId,
      action: 'screen.rotated',
      targetType: 'screen',
      targetId: screenId,
      meta: { name: screenNameOf(screenId), pending: true },
    })
  }

  return { pending: true }
}

/** Имя экрана для журнала: без него запись «отвязан» бесполезна при разборе. */
function screenNameOf(screenId: string): string | null {
  return db.select({ name: screens.name }).from(screens).where(eq(screens.id, screenId)).get()?.name ?? null
}

export function markScreenUnpaired(screenId: string): void {
  const companyId = screenCompanyId(screenId)

  db.update(screens).set({ status: 'unpaired', updatedAt: new Date() }).where(eq(screens.id, screenId)).run()

  // Экран потерял локальные учётные данные — обычно после очистки данных
  // браузера на телевизоре. Причина известна сразу, и она важнее «нет связи».
  if (companyId) {
    recordEventIncident({
      screenId,
      companyId,
      type: 'unpaired',
      detail: 'Экран потерял учётные данные и ждёт привязки',
    })
  }
}

function screenCompanyId(screenId: string): string | null {
  return (
    db.select({ companyId: screens.companyId }).from(screens).where(eq(screens.id, screenId)).get()?.companyId ?? null
  )
}
