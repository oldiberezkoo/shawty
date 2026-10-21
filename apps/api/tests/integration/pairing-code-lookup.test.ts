/**
 * Сценарий подключения без сканирования QR.
 *
 * Проверяет то, ради чего страница подключения переписана: человек открыл
 * панель на компьютере, прочитал код с экрана телевизора глазами и ввёл его
 * руками. Раньше это было невозможно — форма подтверждения живёт по адресу с
 * `sessionId`, который известен только из QR.
 *
 * Сценарий идёт по-настоящему: телевизор сам запрашивает привязку через
 * `/api/player/pairing/start` и получает настоящий код, а не подставной.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import { branches, companies, memberships, pairingSessions, subscriptions, plans, users } from '@/db/schema'
import { hashPassword } from '@/lib/crypto'
import { findPairingSessionByCode, startPairingSession } from '@/server/services/pairing-service'

const COMPANY = 'cmp_pair_lookup'
const ACTOR = 'usr_pair_lookup'

function wipeAllTables(): void {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all() as { name: string }[]

  sqlite.pragma('foreign_keys = OFF')
  for (const row of rows) sqlite.exec(`DELETE FROM "${row.name}"`)
  sqlite.pragma('foreign_keys = ON')
}

function seedFixture(): void {
  db.insert(users)
    .values({ id: ACTOR, email: 'pair@lookup.test', passwordHash: hashPassword('demo1234'), name: 'Оператор' })
    .run()

  db.insert(companies)
    .values({ id: COMPANY, slug: 'pair-lookup', name: 'Сеть', timezone: 'Asia/Tashkent' })
    .run()

  db.insert(branches).values({ id: 'brn_lookup', companyId: COMPANY, name: 'Филиал' }).run()

  db.insert(memberships)
    .values({ id: 'mem_lookup', userId: ACTOR, companyId: COMPANY, role: 'owner', status: 'active' })
    .run()

  db.insert(plans)
    .values({
      id: 'plan_pair_lookup',
      name: 'Test',
      screensLimit: 10,
      branchesLimit: 10,
      storageBytesLimit: 1024 ** 3,
      seatsLimit: 5,
      eventRetentionDays: 30,
      monthlyPriceCents: 0,
      currency: 'UZS',
    })
    .run()

  db.insert(subscriptions)
    .values({
      id: 'sub_pair_lookup',
      companyId: COMPANY,
      planId: 'plan_pair_lookup',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .run()
}

const request = () => new Request('http://localhost/api/dashboard/pairing/lookup', { method: 'POST' })

beforeEach(() => {
  wipeAllTables()
  seedFixture()
})

describe('поиск сессии по коду', () => {
  it('код с экрана телевизора находит свою сессию', () => {
    const started = startPairingSession({
      ip: '10.0.0.5',
      request: new Request('http://localhost/api/player/pairing/start', { method: 'POST' }),
      deviceNonce: 'nonce-1',
    })

    const found = findPairingSessionByCode({ code: started.code, request: request() })

    expect(found).toEqual({ sessionId: started.sessionId })
  })

  it('чужой код не находит ничего', () => {
    startPairingSession({
      ip: '10.0.0.5',
      request: new Request('http://localhost/api/player/pairing/start', { method: 'POST' }),
      deviceNonce: 'nonce-1',
    })

    const found = findPairingSessionByCode({ code: '00000000', request: request() })

    expect(found).toEqual({ error: 'not_found' })
  })

  it('истёкшая сессия по коду не находится', () => {
    const started = startPairingSession({
      ip: '10.0.0.5',
      request: new Request('http://localhost/api/player/pairing/start', { method: 'POST' }),
      deviceNonce: 'nonce-1',
    })

    db.update(pairingSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pairingSessions.id, started.sessionId))
      .run()

    expect(findPairingSessionByCode({ code: started.code, request: request() })).toEqual({ error: 'not_found' })
  })

  it('подтверждённая сессия по коду не находится', () => {
    const started = startPairingSession({
      ip: '10.0.0.5',
      request: new Request('http://localhost/api/player/pairing/start', { method: 'POST' }),
      deviceNonce: 'nonce-1',
    })

    db.update(pairingSessions).set({ status: 'confirmed' }).where(eq(pairingSessions.id, started.sessionId)).run()

    // Иначе по старому коду можно было бы снова открыть форму подтверждения
    // для уже привязанного телевизора.
    expect(findPairingSessionByCode({ code: started.code, request: request() })).toEqual({ error: 'not_found' })
  })

  it('сам код в базе не лежит — только хеш', () => {
    const started = startPairingSession({
      ip: '10.0.0.5',
      request: new Request('http://localhost/api/player/pairing/start', { method: 'POST' }),
      deviceNonce: 'nonce-1',
    })

    const row = db.select().from(pairingSessions).where(eq(pairingSessions.id, started.sessionId)).get()

    expect(row?.codeLookupHash).toBeTruthy()
    expect(row?.codeLookupHash).not.toBe(started.code)
    expect(row?.codeHash).not.toBe(started.code)
  })
})