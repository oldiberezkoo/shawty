import { and, count, eq, gte, gt, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { db, withImmediateTransaction, type Transaction } from '@/db/client'
import {
  auditLog,
  branches,
  deviceCredentials,
  pairingSessions,
  plans,
  screenGroups,
  screenPublications,
  screens,
  subscriptions,
} from '@/db/schema'
import { hashSecret, safeEqual } from '@/lib/crypto'
import {
  randomCode,
  randomDeviceId,
  randomDeviceSecret,
  randomSessionId,
} from '@/lib/ids'
import { loadOrCreateSecret } from '@/lib/secret-store'
import { serverConfig } from '@/config/server'
import {
  buildConfirmUrl,
  evaluateConfirm,
  evaluateWatch,
  hashPairingCode,
  type ConfirmRejection,
  type PairingWatchState,
} from '@/domain/pairing/policy'
import type { Access } from '@/domain/authz/permissions'
import { HttpError } from '@/server/http/errors'
import { enforceRateLimit, ipKey, keyOf } from '@/server/http/rate-limit'

export type StartPairingResult = {
  sessionId: string
  code: string
  expiresAt: Date
  confirmUrl: string
  pollAfterMs: number
  /** Есть ли код прямо в QR: клиент покажет это подписью под QR. */
  codeInQr: boolean
}

/**
 * Шаг 1. Телевизор открывает сессию привязки.
 *
 * Телевизор локально генерирует `deviceNonce` — 256 бит, которые никогда не
 * показываются и не передаются открыто. Требование этого nonce при обмене
 * отделяет «того, кто открыл сессию» от «того, кто посмотрел на экран».
 */
export function startPairingSession(params: {
  ip: string | null
  request: Request
  deviceNonce: string
}): StartPairingResult {
  const { codeTtlMs, codeLength, qrCarriesCode, maxPendingSessions } = serverConfig.pairing

  enforceRateLimit(
    ipKey('pairing:start', params.request),
    serverConfig.pairing.rateLimit.startPerIp,
    'Слишком много попыток начать привязку. Повторите через несколько минут.',
  )

  const sessionId = randomSessionId()
  const code = randomCode(codeLength)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + codeTtlMs)
  const secret = loadOrCreateSecret()

  withImmediateTransaction((tx) => {
    // Считаем и создаём в одной транзакции, иначе параллельные телевизоры
    // все одновременно пройдут проверку и исчерпают лимит сессий.
    const pendingRow = tx
      .select({ pending: count() })
      .from(pairingSessions)
      .where(eq(pairingSessions.status, 'pending'))
      .get()

    if ((pendingRow?.pending ?? 0) >= maxPendingSessions) {
      throw HttpError.tooManyRequests('Сервис перегружен, попробуйте позже.', 60_000)
    }

    tx.insert(pairingSessions)
      .values({
        id: sessionId,
        codeHash: hashPairingCode(secret, sessionId, code),
        // Отдельно от `codeHash`: тот привязан к паре «сессия + код» и по
        // одному коду не ищется. Без этого поля путь «не сканировал QR»
        // обрывался, и подсказка на экране подключения отправляла человека
        // на телевизор без способа вернуться сюда с кодом.
        codeLookupHash: hashSecret(`pairing-code:${code}`),
        deviceNonceHash: hashSecret(`${sessionId}:${params.deviceNonce}`),
        status: 'pending',
        maxAttempts: serverConfig.pairing.maxAttempts,
        createdAt: now,
        expiresAt,
        createdIp: params.ip,
      })
      .run()
  })

  return {
    sessionId,
    code,
    expiresAt,
    confirmUrl: buildConfirmUrl(serverConfig.publicUrl, sessionId, qrCarriesCode ? code : null),
    pollAfterMs: 5_000,
    codeInQr: qrCarriesCode,
  }
}

/**
 * Поиск сессии по восьмизначному коду с экрана телевизора.
 *
 * Нужен для пути «открыл панель на компьютере, код прочитал глазами»:
 * раньше сессия находилась только по `sessionId` из QR, и тот, кто QR не
 * сканировал, до формы подтверждения не доходил вовсе.
 *
 * Ограничение частоты здесь не формальность: без него восьмизначный код
 * перебирается за разумное время. Окно жизни кода — несколько минут, но и
 * этого достаточно, поэтому подбор ограничен и по времени, и по частоте.
 *
 * Совпадение кода у двух ожидающих сессий возможно, но практически
 * не встречается: код восьмизначный, одновременно ожидающих сессий единицы.
 * В этом редком случае вернётся одна из них, и для второго телевизора код
 * придётся получить заново — это лучше, чем усложнять путь подбора.
 */
export function findPairingSessionByCode(params: {
  code: string
  request: Request
}): { sessionId: string } | { error: 'rate_limited' | 'not_found' } {
  enforceRateLimit(
    ipKey('pairing:lookup', params.request),
    // Столько попыток на IP, сколько разумно для человека с глазами
    // вместо камеры. Подбор восьмизначного кода при таком лимите не окупается.
    { limit: 10, windowMs: 10 * 60_000 },
    'Слишком много попыток ввода кода. Повторите через несколько минут.',
  )

  const row = db
    .select({ id: pairingSessions.id })
    .from(pairingSessions)
    .where(
      and(
        eq(pairingSessions.codeLookupHash, hashSecret(`pairing-code:${params.code}`)),
        eq(pairingSessions.status, 'pending'),
        gt(pairingSessions.expiresAt, new Date()),
      ),
    )
    .get()

  if (!row) return { error: 'not_found' }

  return { sessionId: row.id }
}

export function watchPairing(sessionId: string): PairingWatchState & { sessionId: string; codeInQr: boolean } {
  const row = db.select().from(pairingSessions).where(eq(pairingSessions.id, sessionId)).get()
  if (!row) return { sessionId, state: 'expired', codeInQr: false }

  const state = evaluateWatch(
    {
      id: row.id,
      codeHash: row.codeHash,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      expiresAt: row.expiresAt,
    },
    new Date(),
  )

  return { sessionId, ...state, codeInQr: serverConfig.pairing.qrCarriesCode }
}

export type ConfirmPairingParams = {
  sessionId: string
  code: string
  companyId: string
  branchId: string
  screenName: string
  groupId?: string | null
  actor: { userId: string; access: Access }
}

export type ConfirmPairingResult =
  | {
      ok: true
      screenId: string
      deviceId: string
    }
  | { ok: false; reason: ConfirmRejection }

type LimitCheck = { allowed: true } | { allowed: false; used: number; limit: number; reason: string }

/**
 * Проверка тарифного лимита экранов. Вызывается внутри той же транзакции,
 * что и создание экрана: иначе между проверкой и вставкой лимит успевает
 * превысить кто-то ещё.
 */
function checkScreenLimit(tx: Transaction, companyId: string): LimitCheck {
  const subscription = tx
    .select({
      status: subscriptions.status,
      screensLimit: plans.screensLimit,
      extraScreens: subscriptions.extraScreens,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, companyId))
    .get()

  if (!subscription) {
    return { allowed: false, used: 0, limit: 0, reason: 'У компании нет активной подписки' }
  }

  if (subscription.status === 'suspended' || subscription.status === 'cancelled') {
    return { allowed: false, used: 0, limit: 0, reason: 'Подписка приостановлена' }
  }

  const usedRow = tx
    .select({ used: count() })
    .from(screens)
    .where(and(eq(screens.companyId, companyId), ne(screens.status, 'revoked')))
    .get()

  const current = usedRow?.used ?? 0
  const limit = subscription.screensLimit + subscription.extraScreens

  if (current >= limit) {
    return {
      allowed: false,
      used: current,
      limit,
      reason: `Исчерпан лимит тарифа: ${current} из ${limit} экранов. Докупите экраны или смените тариф`,
    }
  }

  return { allowed: true }
}

/**
 * Шаг 3. Авторизованный пользователь подтверждает привязку.
 *
 * Вся операция — одна транзакция `BEGIN IMMEDIATE`. Ключевой момент: захват
 * сессии выполняется условным UPDATE с проверкой `status = 'pending'`. Если
 * обновлено ноль строк, гонку выиграл другой запрос, и повторное подтверждение
 * физически невозможно — это и есть требуемая атомарность конкурентных
 * подтверждений. Счётчик попыток при этом растёт на каждом подтверждении,
 * независимо от верности кода, — это и есть защита от перебора.
 */
export function confirmPairing(params: ConfirmPairingParams): ConfirmPairingResult {
  const { access } = params.actor

  if (!access.can('screens:pair')) {
    throw HttpError.forbidden('Подтверждать привязку может только владелец или администратор')
  }

  const now = new Date()
  const secret = loadOrCreateSecret()
  const deviceId = randomDeviceId()

  return withImmediateTransaction((tx) => {
    tx.update(pairingSessions)
      .set({ attempts: sql`${pairingSessions.attempts} + 1`, lastAttemptAt: now })
      .where(
        and(
          eq(pairingSessions.id, params.sessionId),
          eq(pairingSessions.status, 'pending'),
          gt(pairingSessions.expiresAt, now),
        ),
      )
      .run()

    const row = tx.select().from(pairingSessions).where(eq(pairingSessions.id, params.sessionId)).get()

    const decision = evaluateConfirm(
      row
        ? {
            id: row.id,
            codeHash: row.codeHash,
            status: row.status,
            attempts: row.attempts,
            maxAttempts: row.maxAttempts,
            expiresAt: row.expiresAt,
          }
        : undefined,
      params.code,
      secret,
      now,
    )

    if (!decision.allowed) {
      return { ok: false, reason: decision.reason }
    }

    const branch = tx
      .select({ id: branches.id, companyId: branches.companyId, name: branches.name })
      .from(branches)
      .where(eq(branches.id, params.branchId))
      .get()

    if (!branch || branch.companyId !== params.companyId) {
      throw HttpError.notFound('Филиал не найден')
    }

    if (!access.canAccess('screens:pair', { branchId: branch.id })) {
      throw HttpError.forbidden('Нет доступа к этому филиалу')
    }

    if (params.groupId) {
      const group = tx
        .select({ id: screenGroups.id, companyId: screenGroups.companyId })
        .from(screenGroups)
        .where(eq(screenGroups.id, params.groupId))
        .get()

      if (!group || group.companyId !== params.companyId) {
        throw HttpError.notFound('Группа экранов не найдена')
      }
    }

    const limit = checkScreenLimit(tx, params.companyId)
    if (!limit.allowed) {
      // Сессия остаётся pending: после расширения тарифа подтверждение можно
      // повторить, не начиная привязку на телевизоре заново.
      throw HttpError.conflict('limit_reached', limit.reason, {
        used: limit.used,
        limit: limit.limit,
      })
    }

    const claimed = tx
      .update(pairingSessions)
      .set({
        status: 'confirmed',
        confirmedAt: now,
        confirmedByUserId: params.actor.userId,
        companyId: params.companyId,
        branchId: branch.id,
        provisionalDeviceId: deviceId,
      })
      .where(and(eq(pairingSessions.id, params.sessionId), eq(pairingSessions.status, 'pending')))
      .run()

    if (claimed.changes !== 1) {
      return { ok: false, reason: 'already_confirmed' }
    }

    const screenId = crypto.randomUUID()

    tx.insert(screens)
      .values({
        id: screenId,
        companyId: params.companyId,
        branchId: branch.id,
        groupId: params.groupId ?? null,
        name: params.screenName.trim().slice(0, 120) || `Экран ${branch.name}`,
        status: 'paired',
        pairedAt: now,
        heartbeatIntervalSec: serverConfig.player.heartbeatSec,
        offlineAfterSec: serverConfig.player.offlineAfterSec,
      })
      .run()

    // Строка состояния публикации нужна сразу: иначе экран появился бы в панели
    // без записи, по которой считается доставка.
    tx.insert(screenPublications).values({ screenId, companyId: params.companyId }).run()

    // Ссылка на экран записывается здесь, а не в условном UPDATE выше:
    // идентификатор экрана известен только после вставки.
    // Обмен учётных данных идёт по этой ссылке.
    tx.update(pairingSessions)
      .set({ screenId })
      .where(and(eq(pairingSessions.id, params.sessionId), eq(pairingSessions.status, 'confirmed')))
      .run()

    tx.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId: params.companyId,
        actorUserId: params.actor.userId,
        action: 'pairing.confirmed',
        targetType: 'screen',
        targetId: screenId,
        metaJson: JSON.stringify({ branchId: branch.id, deviceId }),
        at: now,
      })
      .run()

    return { ok: true, screenId, deviceId }
  })
}

export type ExchangeResult = {
  deviceId: string
  deviceSecret: string
  credentialVersion: number
  screen: { id: string; name: string; companyId: string; branchId: string | null }
}

/**
 * Шаг 4. Телевизор забирает собственные постоянные учётные данные.
 *
 * Доказательство — владение локальным nonce, который телевизор сгенерировал
 * у себя, никогда не показывал и не передавал открыто. Одного идентификатора
 * сессии из QR недостаточно: тот, кто посмотрел на экран, его знает.
 *
 * Секрет устройства создаётся здесь, а не при подтверждении. До этого момента
 * он просто не существует, поэтому хранить его не нужно даже временно —
 * в базе остаётся только HMAC.
 *
 * Отдельный одноразовый токен выдачи сознательно не используется: канал
 * уведомлений и HTTP работают в разных изоляциях процесса, и передавать
 * секрет по сокету означало бы завязать выдачу на разделение памяти. Доказательство
 * по nonce работает в обоих путях, и по сокету не передаётся ничего секретного.
 */
export function exchangeEnrollment(params: {
  sessionId: string
  deviceNonce: string
}): ExchangeResult {
  enforceRateLimit(
    keyOf('pairing:exchange', params.sessionId),
    serverConfig.pairing.rateLimit.exchangePerSession,
    'Слишком много попыток обмена. Повторите позже.',
  )

  const now = new Date()

  return withImmediateTransaction((tx) => {
    const row = tx.select().from(pairingSessions).where(eq(pairingSessions.id, params.sessionId)).get()

    if (!row || row.status !== 'confirmed' || !row.screenId) {
      throw HttpError.badRequest('pairing_not_confirmed', 'Привязка не подтверждена')
    }

    const nonceOk = safeEqual(hashSecret(`${row.id}:${params.deviceNonce}`), row.deviceNonceHash)
    if (!nonceOk) {
      throw HttpError.unauthorized('Недействительные данные привязки')
    }

    // Одноразовость: второй обмен с тем же nonce уже не пройдёт.
    const consumed = tx
      .update(pairingSessions)
      .set({ credentialsIssuedAt: now })
      .where(
        and(
          eq(pairingSessions.id, params.sessionId),
          eq(pairingSessions.status, 'confirmed'),
          isNull(pairingSessions.credentialsIssuedAt),
        ),
      )
      .run()

    if (consumed.changes !== 1) {
      throw HttpError.conflict('already_exchanged', 'Учётные данные уже получены')
    }

    const screen = tx.select().from(screens).where(eq(screens.id, row.screenId!)).get()
    if (!screen || !row.provisionalDeviceId) {
      throw new HttpError(500, 'internal', 'Экран привязки не найден')
    }

    const existing = tx
      .select()
      .from(deviceCredentials)
      .where(eq(deviceCredentials.screenId, screen.id))
      .get()

    if (existing) {
      throw HttpError.conflict('already_enrolled', 'Учётные данные устройства уже выпущены')
    }

    const deviceSecret = randomDeviceSecret()

    tx.insert(deviceCredentials)
      .values({
        id: crypto.randomUUID(),
        screenId: screen.id,
        deviceId: row.provisionalDeviceId,
        secretHash: hashSecret(deviceSecret),
        version: 1,
        issuedAt: now,
      })
      .run()

    return {
      deviceId: row.provisionalDeviceId,
      deviceSecret,
      credentialVersion: 1,
      screen: {
        id: screen.id,
        name: screen.name,
        companyId: screen.companyId,
        branchId: screen.branchId,
      },
    }
  })
}

/**
 * Закрывает истёкшие и исчерпанные сессии. Без этого таблица растёт, а экраны,
 * которые так и не привязали, навсегда остаются в состоянии pending.
 */
export function expireStaleSessions(now = new Date()): number {
  return db
    .update(pairingSessions)
    .set({ status: 'expired' })
    .where(
      and(
        eq(pairingSessions.status, 'pending'),
        or(
          lt(pairingSessions.expiresAt, now),
          gte(pairingSessions.attempts, sql`${pairingSessions.maxAttempts}`),
        ),
      ),
    )
    .run().changes
}
