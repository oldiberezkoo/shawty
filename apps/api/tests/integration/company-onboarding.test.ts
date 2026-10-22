/**
 * Создание компании и первый вход.
 *
 * Проверяется главное, что ломалось: регистрация без приглашения оставляла
 * пользователя без компании, а панель отправляла его обратно на вход.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import { companies, memberships, plans, subscriptions, users } from '@/db/schema'
import { hashPassword } from '@/lib/crypto'
import {
  completePlanOnboarding,
  createCompanyForOwner,
  isOnboardingCompleted,
} from '@/server/services/company-service'
import { DEFAULT_PLANS, STARTER_PLAN_ID } from '@/domain/billing/plans'

const USER = 'usr_company_owner'

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

beforeEach(() => {
  wipeAllTables()

  db.insert(users)
    .values({
      id: USER,
      email: 'owner@company.test',
      passwordHash: hashPassword('demo1234'),
      name: 'Владелец',
    })
    .run()
})

describe('создание компании', () => {
  it('создаёт владельца, подписку на Start и стартовые тарифы', () => {
    const created = createCompanyForOwner({ userId: USER, name: 'Кофейня «Утро»' })

    const company = db.select().from(companies).where(eq(companies.id, created.companyId)).get()
    expect(company?.name).toBe('Кофейня «Утро»')
    expect(company?.slug).toBe('kofeynya-utro')

    // Компания без владельца недоступна, а без подписки панель открывается
    // с ошибкой «тариф не настроен».
    const membership = db.select().from(memberships).where(eq(memberships.userId, USER)).get()
    expect(membership?.companyId).toBe(created.companyId)
    expect(membership?.role).toBe('owner')
    expect(membership?.status).toBe('active')

    const subscription = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, created.companyId))
      .get()
    expect(subscription?.planId).toBe(STARTER_PLAN_ID)
    expect(subscription?.status).toBe('active')

    // Регистрация не должна зависеть от `pnpm db:seed`: тарифы появляются
    // вместе с первой сетью.
    const planRows = db.select().from(plans).all()
    expect(planRows.map((plan) => plan.id).sort()).toEqual(DEFAULT_PLANS.map((plan) => plan.id).sort())
  })

  it('не переиспользует слаг занятой компании', () => {
    const first = createCompanyForOwner({ userId: USER, name: 'Сеть' })

    db.insert(users)
      .values({
        id: 'usr_second',
        email: 'second@company.test',
        passwordHash: hashPassword('demo1234'),
        name: 'Второй',
      })
      .run()

    const second = createCompanyForOwner({ userId: 'usr_second', name: 'Сеть' })

    expect(first.slug).toBe('set')
    expect(second.slug).toBe('set-2')
  })

  it('флаг онбординга ставится один раз и не перезаписывается', () => {
    const { companyId } = createCompanyForOwner({ userId: USER, name: 'Сеть' })

    expect(isOnboardingCompleted(companyId)).toBe(false)

    completePlanOnboarding(companyId, new Date('2026-01-01T00:00:00Z'))
    expect(isOnboardingCompleted(companyId)).toBe(true)

    // Повторный вызов не должен сдвигать дату: по ней видно, когда владелец
    // действительно прошёл онбординг.
    completePlanOnboarding(companyId, new Date('2026-02-01T00:00:00Z'))

    const row = db.select().from(companies).where(eq(companies.id, companyId)).get()
    expect(row?.onboardingCompletedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})
