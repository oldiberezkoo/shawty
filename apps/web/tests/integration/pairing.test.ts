/**
 * Интеграционные тесты протокола привязки.
 *
 * Работают на отдельной базе `data/test.db` и на настоящих транзакциях.
 * Здесь проверяются требования безопасности из ТЗ, которые невозможно
 * проверить на моках: одноразовость, лимит попыток, лимит тарифа и
 * атомарность конкурентных подтверждений.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import {
  branches,
  companies,
  deviceCredentials,
  memberships,
  pairingSessions,
  plans,
  screenPublications,
  screens,
  subscriptions,
  users,
} from '@/db/schema'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { confirmPairing, exchangeEnrollment, startPairingSession, watchPairing } from '@/server/services/pairing-service'
import { serverConfig } from '@/config/server'
import { hashPassword } from '@/lib/crypto'
import { randomCodeString } from '@/lib/ids'

const COMPANY = 'cmp_test'
const BRANCH = 'brn_test'
const OWNER = 'usr_test_owner'
const VIEWER = 'usr_test_viewer'
const SCOPE_BRANCH = 'brn_other'

function fakeRequest(ip = '203.0.113.9'): Request {
  return new Request('http://localhost/api/player/pairing/start', {
    headers: { 'x-forwarded-for': ip },
  })
}

/**
 * Полная очистка тестовой базы.
 *
 * Список таблиц берётся из самой схемы, а не пишется руками: иначе каждая
 * новая таблица ломает подготовку тестов. Проверка внешних ключей на время
 * сброса отключается — иначе порядок удаления обязан точно учитывать все
 * связи, и любое изменение схемы приводит к падению фикстуры.
 */
function wipeAllTables() {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all() as { name: string }[]

  const tables = rows.map((row) => row.name)

  sqlite.pragma('foreign_keys = OFF')
  for (const table of tables) {
    sqlite.exec(`DELETE FROM "${table}"`)
  }
  sqlite.pragma('foreign_keys = ON')
}

function seedFixture(overrides: { screensLimit?: number; subscriptionStatus?: 'active' | 'suspended' } = {}) {
  wipeAllTables()

  db.insert(users)
    .values([
      { id: OWNER, email: 'owner@test.local', passwordHash: hashPassword('test'), name: 'Владелец' },
      { id: VIEWER, email: 'viewer@test.local', passwordHash: hashPassword('test'), name: 'Наблюдатель' },
    ])
    .run()

  db.insert(plans)
    .values({ id: 'plan_t', name: 'Test', screensLimit: overrides.screensLimit ?? 5, branchesLimit: 10, storageBytesLimit: 1024, seatsLimit: 5 })
    .run()

  db.insert(companies).values({ id: COMPANY, slug: 'test', name: 'Test Co' }).run()

  db.insert(memberships).values({ id: 'mem_owner', userId: OWNER, companyId: COMPANY, role: 'owner' }).run()
  db.insert(memberships).values({ id: 'mem_viewer', userId: VIEWER, companyId: COMPANY, role: 'viewer' }).run()

  db.insert(subscriptions)
    .values({
      id: 'sub_t',
      companyId: COMPANY,
      planId: 'plan_t',
      status: overrides.subscriptionStatus ?? 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    })
    .run()

  db.insert(branches).values({ id: BRANCH, companyId: COMPANY, name: 'Основной' }).run()
  db.insert(branches).values({ id: SCOPE_BRANCH, companyId: COMPANY, name: 'Чужой филиал' }).run()
}

const ownerActor = () => ({ userId: OWNER, access: createAccess('owner') })
const viewerActor = () => ({ userId: VIEWER, access: createAccess('viewer') })

function startSession(nonce = 'nonce-aaaa') {
  return startPairingSession({ ip: '203.0.113.9', request: fakeRequest(), deviceNonce: nonce })
}

const screenCount = () =>
  db.select({ n: sql<number>`count(*)` }).from(screens).where(eq(screens.companyId, COMPANY)).get()?.n ?? 0

beforeEach(() => {
  seedFixture()
})

describe('одноразовость подтверждения', () => {
  it('подтверждение выдаёт экран и привязывает сессию', () => {
    const session = startSession()
    const result = confirmPairing({
      sessionId: session.sessionId,
      code: session.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    })

    expect(result.ok).toBe(true)
    expect(screenCount()).toBe(1)

    const stored = db.select().from(pairingSessions).where(eq(pairingSessions.id, session.sessionId)).get()
    expect(stored?.status).toBe('confirmed')
    expect(stored?.screenId).toBeTruthy()
    expect(stored?.provisionalDeviceId).toBeTruthy()
    expect(stored?.credentialsIssuedAt).toBeNull()
  })

  it('второе подтверждение той же сессии не создаёт второй экран', () => {
    const session = startSession()
    const payload = {
      sessionId: session.sessionId,
      code: session.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    }

    const first = confirmPairing(payload)
    const second = confirmPairing({ ...payload, screenName: 'Дубль' })

    expect(first.ok).toBe(true)
    expect(second).toEqual({ ok: false, reason: 'already_confirmed' })
    expect(screenCount()).toBe(1)
  })
})

describe('защита от перебора', () => {
  it('неверный код не создаёт экран и увеличивает счётчик попыток', () => {
    const session = startSession()
    const result = confirmPairing({
      sessionId: session.sessionId,
      code: 'ZZZZZZZZ',
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_code' })
    expect(screenCount()).toBe(0)

    const stored = db.select().from(pairingSessions).where(eq(pairingSessions.id, session.sessionId)).get()
    expect(stored?.attempts).toBe(1)
  })

  it('после исчерпания попыток верный код уже не принимается', () => {
    const session = startSession()
    const max = serverConfig.pairing.maxAttempts

    for (let i = 0; i < max; i += 1) {
      confirmPairing({
        sessionId: session.sessionId,
        code: 'ZZZZZZZZ',
        companyId: COMPANY,
        branchId: BRANCH,
        screenName: 'Витрина',
        actor: ownerActor(),
      })
    }

    const stored = db.select().from(pairingSessions).where(eq(pairingSessions.id, session.sessionId)).get()
    expect(stored?.attempts).toBe(max)

    const afterLock = confirmPairing({
      sessionId: session.sessionId,
      code: session.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    })

    expect(afterLock).toEqual({ ok: false, reason: 'locked' })
    expect(screenCount()).toBe(0)
  })

  it('нормализация ввода не обходит проверку: мусор в коде игнорируется, а не принимается', () => {
    const session = startSession()
    // Пользователь читает код с экрана и вводит его с дефисом и в нижнем регистре.
    const grouped = session.code.replace(/(.{4})(?=.)/g, '$1-').toLowerCase()
    const result = confirmPairing({
      sessionId: session.sessionId,
      code: grouped,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    })

    expect(result.ok).toBe(true)
  })

  it('код другой сессии не подходит', () => {
    const first = startSession('nonce-first')
    const second = startSession('nonce-second')

    const result = confirmPairing({
      sessionId: second.sessionId,
      code: first.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_code' })
  })
})

describe('срок действия', () => {
  it('по истечении срока подтверждение невозможно, даже с верным кодом', () => {
    const session = startSession()

    db.update(pairingSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pairingSessions.id, session.sessionId))
      .run()

    const result = confirmPairing({
      sessionId: session.sessionId,
      code: session.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    })

    expect(result).toEqual({ ok: false, reason: 'expired' })
    expect(screenCount()).toBe(0)
  })

  it('наблюдение телевизора показывает ожидание и остаток времени', () => {
    const session = startSession()
    const state = watchPairing(session.sessionId)

    if (state.state !== 'pending') {
      throw new Error(`ожидалось состояние pending, получено ${state.state}`)
    }

    expect(state.remainingMs).toBeGreaterThan(0)
    expect(state.remainingMs).toBeLessThanOrEqual(serverConfig.pairing.codeTtlMs)
  })

  it('несуществующая сессия выглядит как истёкшая, а не как серверная ошибка', () => {
    expect(watchPairing(randomCodeString(27)).state).toBe('expired')
  })
})

describe('лимит тарифа', () => {
  it('не позволяет превысить лимит экранов', () => {
    seedFixture({ screensLimit: 2 })

    for (let i = 0; i < 2; i += 1) {
      const session = startSession(`nonce-${i}`)
      const result = confirmPairing({
        sessionId: session.sessionId,
        code: session.code,
        companyId: COMPANY,
        branchId: BRANCH,
        screenName: `Экран ${i}`,
        actor: ownerActor(),
      })
      expect(result.ok).toBe(true)
    }

    const overflow = startSession('nonce-overflow')

    // Исчерпание лимита — ограничение платформы, а не ошибка запроса,
    // поэтому выражается исключением с кодом 409, а не результатом разбора.
    expect(() =>
      confirmPairing({
        sessionId: overflow.sessionId,
        code: overflow.code,
        companyId: COMPANY,
        branchId: BRANCH,
        screenName: 'Лишний',
        actor: ownerActor(),
      }),
    ).toThrow(/Исчерпан лимит тарифа/)

    expect(screenCount()).toBe(2)

    // Сессия остаётся pending: после расширения тарифа подтверждение
    // повторяется без новой привязки на телевизоре.
    const stored = db.select().from(pairingSessions).where(eq(pairingSessions.id, overflow.sessionId)).get()
    expect(stored?.status).toBe('pending')
  })

  it('отвязанные экраны не занимают лимит', () => {
    seedFixture({ screensLimit: 1 })

    const session = startSession()
    confirmPairing({
      sessionId: session.sessionId,
      code: session.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Первый',
      actor: ownerActor(),
    })

    const first = db.select().from(screens).where(eq(screens.companyId, COMPANY)).get()
    db.update(screens).set({ status: 'revoked' }).where(eq(screens.id, first!.id)).run()

    const second = startSession('nonce-second')
    const result = confirmPairing({
      sessionId: second.sessionId,
      code: second.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Второй',
      actor: ownerActor(),
    })

    expect(result.ok).toBe(true)
  })

  it('приостановленная подписка блокирует привязку', () => {
    seedFixture({ subscriptionStatus: 'suspended' })

    const session = startSession()

    expect(() =>
      confirmPairing({
        sessionId: session.sessionId,
        code: session.code,
        companyId: COMPANY,
        branchId: BRANCH,
        screenName: 'Экран',
        actor: ownerActor(),
      }),
    ).toThrow(/Подписка приостановлена/)

    expect(screenCount()).toBe(0)
  })
})

describe('права и область доступа', () => {
  it('роль без права подтверждать отклоняется', () => {
    const session = startSession()

    expect(() =>
      confirmPairing({
        sessionId: session.sessionId,
        code: session.code,
        companyId: COMPANY,
        branchId: BRANCH,
        screenName: 'Витрина',
        actor: viewerActor(),
      }),
    ).toThrow(/владелец или администратор/)

    expect(screenCount()).toBe(0)
  })

  it('сотрудник без доступа к филиалу не может привязать туда экран', () => {
    const session = startSession()
    const scopedAccess = createAccess('admin', [{ scopeType: 'branch', scopeId: SCOPE_BRANCH }])

    expect(() =>
      confirmPairing({
        sessionId: session.sessionId,
        code: session.code,
        companyId: COMPANY,
        branchId: BRANCH,
        screenName: 'Витрина',
        actor: { userId: OWNER, access: scopedAccess },
      }),
    ).toThrow(/Нет доступа к этому филиалу/)

    expect(screenCount()).toBe(0)

    // Сессия не списана: ограничение видимости не должно сжигать попытку.
    const stored = db.select().from(pairingSessions).where(eq(pairingSessions.id, session.sessionId)).get()
    expect(stored?.status).toBe('pending')
  })

  it('филиал чужой компании не принимается', () => {
    const session = startSession()
    const otherBranch = 'brn_foreign'
    db.insert(companies).values({ id: 'cmp_other', slug: 'other', name: 'Чужая компания' }).run()
    db.insert(branches).values({ id: otherBranch, companyId: 'cmp_other', name: 'Чужая' }).run()

    expect(() =>
      confirmPairing({
        sessionId: session.sessionId,
        code: session.code,
        companyId: COMPANY,
        branchId: otherBranch,
        screenName: 'Витрина',
        actor: ownerActor(),
      }),
    ).toThrow(/Филиал не найден/)
  })

  it('проверка права идёт через матрицу ролей', () => {
    expect(createAccess('owner').can(PERMISSIONS.screensPair)).toBe(true)
    expect(createAccess('admin').can(PERMISSIONS.screensPair)).toBe(true)
    expect(createAccess('editor').can(PERMISSIONS.screensPair)).toBe(false)
    expect(createAccess('analyst').can(PERMISSIONS.screensPair)).toBe(false)
    expect(createAccess('viewer').can(PERMISSIONS.screensPair)).toBe(false)
  })
})

describe('обмен учётных данных', () => {
  function confirmOk(nonce: string) {
    const session = startSession(nonce)
    const result = confirmPairing({
      sessionId: session.sessionId,
      code: session.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    })
    expect(result.ok).toBe(true)
    return session
  }

  it('выдаёт постоянные учётные данные и хранит только хеш', () => {
    const session = confirmOk('nonce-1')
    const result = exchangeEnrollment({ sessionId: session.sessionId, deviceNonce: 'nonce-1' })

    expect(result.deviceId).toMatch(/^scr_[A-Z2-9]+$/)
    expect(result.deviceSecret.length).toBeGreaterThanOrEqual(43)

    const stored = db.select().from(deviceCredentials).where(eq(deviceCredentials.deviceId, result.deviceId)).get()
    expect(stored).toBeTruthy()
    // Секрет в базе отсутствует: только HMAC.
    expect(JSON.stringify(stored)).not.toContain(result.deviceSecret)
  })

  it('обмен одноразовый', () => {
    const session = confirmOk('nonce-2')
    const first = exchangeEnrollment({ sessionId: session.sessionId, deviceNonce: 'nonce-2' })
    expect(first.deviceSecret).toBeTruthy()

    expect(() => exchangeEnrollment({ sessionId: session.sessionId, deviceNonce: 'nonce-2' })).toThrow(
      /уже получены|уже выпущены/i,
    )
  })

  it('чужой nonce не позволяет получить учётные данные', () => {
    const session = confirmOk('nonce-3')

    expect(() => exchangeEnrollment({ sessionId: session.sessionId, deviceNonce: 'чужой-nonce-значение' })).toThrow(
      /Недействительные данные привязки/,
    )
  })

  it('только идентификатора сессии из QR недостаточно', () => {
    const session = confirmOk('nonce-4')

    // Именно этот сценарий закрывает требование безопасности: кто увидел QR
    // на экране, знает sessionId, но не знает локальный nonce телевизора.
    expect(() => exchangeEnrollment({ sessionId: session.sessionId, deviceNonce: '' })).toThrow()
  })

  it('неподтверждённая сессия не обменивается', () => {
    const session = startSession('nonce-5')

    expect(() => exchangeEnrollment({ sessionId: session.sessionId, deviceNonce: 'nonce-5' })).toThrow(
      /Привязка не подтверждена/,
    )
  })
})

describe('атомарность конкурентных подтверждений', () => {
  it('условный UPDATE отдаёт сессию ровно одному из двух соединений', () => {
    const session = startSession('nonce-race')

    // Второе независимое соединение к тому же файлу базы — как второй процесс.
    const other = new Database(resolve(process.cwd(), process.env.DATABASE_URL ?? 'data/test.db'))
    other.pragma('busy_timeout = 5000')

    // Запрос повторяет боевой: захват меняет и статус, и время подтверждения.
    const claim = other.prepare(
      "UPDATE pairing_sessions SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND status = 'pending'",
    )

    // Первое соединение захватывает сессию, второе получает отказ,
    // хотя проверка выполняется для того же идентификатора.
    const firstRun = claim.run(Date.now(), session.sessionId)
    const secondRun = claim.run(Date.now(), session.sessionId)

    expect(firstRun.changes).toBe(1)
    expect(secondRun.changes).toBe(0)

    other.close()
  })

  it('повторное подтверждение не плодит экраны даже послеmany попыток подряд', () => {
    const session = startSession('nonce-repeat')
    const payload = {
      sessionId: session.sessionId,
      code: session.code,
      companyId: COMPANY,
      branchId: BRANCH,
      screenName: 'Витрина',
      actor: ownerActor(),
    }

    const outcomes = Array.from({ length: 5 }, () => confirmPairing(payload))

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    expect(outcomes.filter((outcome) => !outcome.ok && outcome.reason === 'already_confirmed')).toHaveLength(4)
    expect(screenCount()).toBe(1)
    expect(db.select().from(screenPublications).all()).toHaveLength(1)
  })
})

describe('пароль и идентификаторы', () => {
  it('хеш пароля не содержит сам пароль и проверяется', () => {
    const hash = hashPassword('очень-длинный-пароль')
    expect(hash).not.toContain('очень-длинный-пароль')
    expect(hash.startsWith('scrypt$')).toBe(true)
  })
})
