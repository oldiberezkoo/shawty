/**
 * Демонстрационные данные для локальной разработки.
 * Идемпотентен: повторный запуск не создаёт дубликаты.
 */
import { eq } from 'drizzle-orm'
import { db, sqlite } from '../src/db/client'
import {
  branches,
  campaigns,
  campaignTargets,
  companies,
  memberships,
  plans,
  scheduleWindows,
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
    // Зона Самарканда на час позже Ташкента. Это не опечатка: окно «с 09:00»
    // в этих филиалах наступает в разное время, и демо-данные обязаны это
    // показывать, иначе расписание проверить не на чем.
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

  seedCampaign()

  console.log('[seed] демо-данные готовы')
  console.log(`[seed] вход: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
})()

/**
 * Демо-кампания с окном показа.
 *
 * Без неё разделы «Кампании» и «Расписание» открываются пустыми, а именно они
 * показывают, что продукт умеет решать, что и когда идти на экран.
 *
 * Контента у кампании нет: плейлист создаёт оператор. Кампания ссылается на
 * версию плейлиста, поэтому в демо она живёт без версии — так она видна в
 * интерфейсе и не превращается в мусор при первом же запуске медиапайплайна.
 */
function seedCampaign(): void {
  const id = 'cmp_demo_autumn'
  const now = new Date()

  // Даты считаем по календарю компании, а не по часам процесса: «до 15 числа»
  // в интерфейсе должно совпадать с тем, что видит оператор в Ташкенте.
  const startsOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now)
  const endsOn = new Date(Date.parse(`${startsOn}T00:00:00Z`) + 30 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10)

  db.insert(campaigns)
    .values({
      id,
      companyId: 'cmp_demo_retail',
      name: 'Осенняя акция — демо',
      kind: 'commercial',
      // Приоритет выше нуля: демо-кампания обязана перебивать постоянную
      // программу, иначе календарь покажет только назначение.
      priority: 10,
      status: 'approved',
      startsOn,
      endsOn,
      approvalRequired: false,
      createdByUserId: 'usr_demo_owner',
      approvedByUserId: 'usr_demo_owner',
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run()

  db.insert(campaignTargets)
    .values({
      id: 'cmt_demo_autumn_company',
      campaignId: id,
      scopeType: 'company',
      scopeId: 'cmp_demo_retail',
    })
    .onConflictDoNothing()
    .run()

  db.insert(campaignTargets)
    .values({
      id: 'cmt_demo_autumn_samarkand',
      campaignId: id,
      scopeType: 'branch',
      scopeId: 'brn_samarkand',
    })
    .onConflictDoNothing()
    .run()

  // Окно «рабочие часы». Бит 0 — понедельник, поэтому маска 0b0011111 — пн–пт.
  db.insert(scheduleWindows)
    .values({
      id: 'swd_demo_autumn_workday',
      campaignId: id,
      daysOfWeek: 0b0011111,
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      timezoneSource: 'branch',
    })
    .onConflictDoNothing()
    .run()
}
