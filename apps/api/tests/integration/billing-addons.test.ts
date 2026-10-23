/**
 * Докупаемые экраны и хранилище.
 *
 * Проверяем не только строку в подписке, но и то, ради чего она нужна:
 * effective-лимит в потреблении, квота медиатеки и запись в журнале.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import { auditLog, companies, memberships, plans, subscriptions, users } from '@/db/schema'
import { hashPassword } from '@/lib/crypto'
import { getSubscription, setAddonQuantity } from '@/server/services/billing-service'
import { storageUsage } from '@/server/services/media-service'
import { ADDON_CATALOG, GIB } from '@/domain/billing/plans'

const COMPANY = 'cmp_addons'
const OWNER = 'usr_addons_owner'
const MIB = 1024 ** 2

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

  db.insert(plans)
    .values({
      id: 'plan_addons',
      name: 'Addons',
      screensLimit: 2,
      branchesLimit: 1,
      storageBytesLimit: 256 * MIB,
      seatsLimit: 1,
      eventRetentionDays: 14,
      monthlyPriceCents: 0,
      currency: 'UZS',
    })
    .run()

  db.insert(users)
    .values({ id: OWNER, email: 'owner@addons.test', passwordHash: hashPassword('demo1234'), name: 'Владелец' })
    .run()

  db.insert(companies)
    .values({ id: COMPANY, slug: 'addons', name: 'Опции', timezone: 'Asia/Tashkent' })
    .run()

  db.insert(memberships)
    .values({ id: 'mem_addons', userId: OWNER, companyId: COMPANY, role: 'owner', status: 'active' })
    .run()

  db.insert(subscriptions)
    .values({
      id: 'sub_addons',
      companyId: COMPANY,
      planId: 'plan_addons',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    })
    .run()
})

describe('докупаемые опции', () => {
  it('экраны сверх тарифа увеличивают effective-лимит и счёт', () => {
    const result = setAddonQuantity({ companyId: COMPANY, kind: 'screens', quantity: 3, actorUserId: OWNER })

    expect(result.addons.screens.quantity).toBe(3)
    expect(result.addons.screens.monthlyPriceCents).toBe(3 * ADDON_CATALOG.screens.unitPriceCents)

    const screens = getSubscription(COMPANY).usage.find((line) => line.key === 'screens')
    expect(screens?.limit).toBe(5)
  })

  it('гигабайты входят и в потребление, и в квоту медиатеки', () => {
    setAddonQuantity({ companyId: COMPANY, kind: 'storage', quantity: 5, actorUserId: OWNER })

    const usage = getSubscription(COMPANY).usage.find((line) => line.key === 'storage')
    expect(usage?.limit).toBe(256 * MIB + 5 * GIB)

    // Медиатека проверяет ту же квоту, но своим запросом: расхождение здесь
    // означало бы «в панели место есть, а загрузка отклоняется».
    expect(storageUsage(COMPANY).limitBytes).toBe(256 * MIB + 5 * GIB)
  })

  it('покупка попадает в журнал, повтор с тем же числом — нет', () => {
    setAddonQuantity({ companyId: COMPANY, kind: 'storage', quantity: 2, actorUserId: OWNER })
    setAddonQuantity({ companyId: COMPANY, kind: 'storage', quantity: 2, actorUserId: OWNER })

    const entries = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'billing.addon_changed'))
      .all()

    expect(entries).toHaveLength(1)
    expect(entries[0]?.metaJson).toContain('"kind":"storage"')
  })

  it('нельзя купить отрицательное или дробное количество', () => {
    expect(() =>
      setAddonQuantity({ companyId: COMPANY, kind: 'screens', quantity: -1, actorUserId: OWNER }),
    ).toThrow(/Количество/)

    expect(() =>
      setAddonQuantity({ companyId: COMPANY, kind: 'storage', quantity: 1.5, actorUserId: OWNER }),
    ).toThrow(/Количество/)
  })
})
