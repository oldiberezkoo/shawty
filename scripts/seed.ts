/**
 * Демонстрационные данные для локальной разработки.
 * Идемпотентен: повторный запуск не создаёт дубликаты.
 */
import { eq } from 'drizzle-orm'
import { db, sqlite } from '../src/db/client'
import {
  branches,
  companies,
  memberships,
  plans,
  screenGroups,
  screens,
  screenPublications,
  subscriptions,
  users,
} from '../src/db/schema'
import { hashPassword } from '../src/lib/crypto'

const DEMO_EMAIL = 'owner@shawty.uz'
const DEMO_PASSWORD = 'demo1234'

function upsertById(
  table: typeof plans,
  id: string,
  values: Omit<typeof plans.$inferInsert, 'id'>,
): void {
  const existing = db.select().from(table).where(eq(table.id, id)).get()

  if (existing) {
    db.update(table).set(values).where(eq(table.id, id)).run()
  } else {
    db.insert(table).values({ ...values, id }).run()
  }
}

sqlite.transaction(() => {
  upsertById(plans, 'plan-starter', {
    name: 'Start',
    screensLimit: 5,
    branchesLimit: 2,
    storageBytesLimit: 5 * 1024 ** 3,
    seatsLimit: 3,
    eventRetentionDays: 14,
    monthlyPriceCents: 0,
    currency: 'UZS',
  })

  upsertById(plans, 'plan-growth', {
    name: 'Growth',
    screensLimit: 80,
    branchesLimit: 25,
    storageBytesLimit: 100 * 1024 ** 3,
    seatsLimit: 10,
    eventRetentionDays: 60,
    monthlyPriceCents: 450_000,
    currency: 'UZS',
  })

  upsertById(plans, 'plan-pro', {
    name: 'Pro',
    screensLimit: 500,
    branchesLimit: 200,
    storageBytesLimit: 1024 * 1024 ** 3,
    seatsLimit: 50,
    eventRetentionDays: 180,
    monthlyPriceCents: 1_800_000,
    currency: 'UZS',
  })

  const existingUser = db.select().from(users).where(eq(users.email, DEMO_EMAIL)).get()

  const userId = existingUser?.id ?? 'usr_demo_owner'
  db.insert(users)
    .values({
      id: userId,
      email: DEMO_EMAIL,
      passwordHash: existingUser?.passwordHash ?? hashPassword(DEMO_PASSWORD),
      name: 'Анна Ким',
      locale: 'ru',
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { passwordHash: hashPassword(DEMO_PASSWORD), name: 'Анна Ким' },
    })
    .run()

  const companyId = 'cmp_demo_retail'
  db.insert(companies)
    .values({
      id: companyId,
      slug: 'demo-retail',
      name: 'Demo Retail',
      timezone: 'Asia/Tashkent',
      locale: 'ru',
      status: 'active',
    })
    .onConflictDoNothing()
    .run()

  db.insert(memberships)
    .values({ id: 'mem_demo_owner', userId, companyId, role: 'owner', status: 'active' })
    .onConflictDoNothing()
    .run()

  db.insert(subscriptions)
    .values({
      id: 'sub_demo',
      companyId,
      planId: 'plan-growth',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    })
    .onConflictDoNothing()
    .run()

  const branchSeed = [
    { id: 'brn_tashkent', name: 'Ташкент — Южный', code: 'TASH-S', timezone: 'Asia/Tashkent' },
    { id: 'brn_samarkand', name: 'Самарканд — Центр', code: 'SAM-C', timezone: 'Asia/Samarkand' },
    { id: 'brn_bukhara', name: 'Бухара — Торговый центр', code: 'BUK-T', timezone: 'Asia/Samarkand' },
  ]

  for (const branch of branchSeed) {
    db.insert(branches).values({ ...branch, companyId }).onConflictDoNothing().run()
  }

  db.insert(screenGroups)
    .values({ id: 'grp_entrance', companyId, branchId: 'brn_tashkent', name: 'Входная группа' })
    .onConflictDoNothing()
    .run()

  const now = Date.now()
  const screensSeed = [
    { id: 'scr_seed_01', name: 'Витрина — вход', branchId: 'brn_tashkent', groupId: 'grp_entrance', minutesAgo: 1, status: 'paired' as const },
    { id: 'scr_seed_02', name: 'Касса 1', branchId: 'brn_tashkent', groupId: null, minutesAgo: 2, status: 'paired' as const },
    { id: 'scr_seed_03', name: 'Касса 2', branchId: 'brn_tashkent', groupId: null, minutesAgo: 45, status: 'paired' as const },
    { id: 'scr_seed_04', name: 'Витрина — вход', branchId: 'brn_samarkand', groupId: null, minutesAgo: 3, status: 'paired' as const },
    { id: 'scr_seed_05', name: 'Фуд-корт', branchId: 'brn_samarkand', groupId: null, minutesAgo: 600, status: 'paired' as const },
    { id: 'scr_seed_06', name: 'Центральный экран', branchId: 'brn_bukhara', groupId: null, minutesAgo: 12, status: 'paired' as const },
  ]

  for (const screen of screensSeed) {
    db.insert(screens)
      .values({
        id: screen.id,
        companyId,
        branchId: screen.branchId,
        groupId: screen.groupId,
        name: screen.name,
        status: screen.status,
        pairedAt: new Date(now - 30 * 24 * 60 * 60_000),
        lastSeenAt: new Date(now - screen.minutesAgo * 60_000),
        playerVersion: '0.1.0',
      })
      .onConflictDoNothing()
      .run()

    db.insert(screenPublications)
      .values({ screenId: screen.id, companyId })
      .onConflictDoNothing()
      .run()
  }

  console.log('[seed] демо-данные готовы')
  console.log(`[seed] вход: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
})()
