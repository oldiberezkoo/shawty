/**
 * Интеграционные тесты кампаний и расписания.
 *
 * Проверяется то, что нельзя проверить чистыми функциями домена: что
 * серверная сборка плана совпадает с тем, что действительно попадёт в
 * манифест, и что насос расписания выпускает публикацию в момент смены
 * программы — сам, без клика.
 *
 * Все проверки выполняются на настоящей базе: кэш плана, зоны филиалов и
 * состояние публикации — это то, ради чего мок был бы бесполезен.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import {
  branches,
  campaigns,
  companies,
  mediaAssets,
  playlistVersionItems,
  playlistVersions,
  playlists,
  releaseAssignments,
  releases,
  screens,
  screenPublications,
  users,
} from '@/db/schema'
import { createCampaign, type CampaignInput } from '@/server/services/campaign-service'
import {
  finishExpiredCampaigns,
  invalidatePlanCache,
  planForScreen,
} from '@/server/services/schedule-service'
import { buildScreenManifest, publishCompany, publishScreens } from '@/server/services/release-service'
import { runSchedulePumpOnce } from '@/server/ws/schedule-pump'
import { localDateString } from '@/domain/schedule/timezone'

const COMPANY = 'cmp_sched'
const BRANCH = 'brn_sched'
const SCREEN = 'scr_sched'
const OWNER = 'usr_sched_owner'

const BASE_VERSION = 'pvr_base'
const PROMO_VERSION = 'pvr_promo'

/** Момент фиксирован: тест не должен зависеть от того, когда его запустили. */
const AT = new Date('2026-03-10T12:30:00Z')

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

function seedPlaylistVersion(playlistId: string, versionId: string, name: string, version: number): void {
  db.insert(playlists).values({ id: playlistId, companyId: COMPANY, name }).run()

  db.insert(playlistVersions)
    .values({ id: versionId, playlistId, version, totalDurationMs: 5000 })
    .run()

  db.insert(playlistVersionItems)
    .values({
      id: `pvi_${versionId}`,
      versionId,
      position: 1,
      mediaAssetId: 'ast_sched',
      durationMs: 5000,
      playPolicy: 'loop_once',
      transition: 'none',
      audio: 'keep',
    })
    .run()
}

function seedFixture(): void {
  const now = new Date()

  db.insert(users)
    .values({ id: OWNER, email: 'sched@test.local', passwordHash: 'x', name: 'Владелец' })
    .run()

  db.insert(companies)
    .values({ id: COMPANY, slug: 'sched', name: 'Расписание', timezone: 'Asia/Tashkent' })
    .run()

  db.insert(branches)
    .values({ id: BRANCH, companyId: COMPANY, name: 'Филиал', timezone: 'Asia/Tashkent' })
    .run()

  db.insert(screens)
    .values({
      id: SCREEN,
      companyId: COMPANY,
      branchId: BRANCH,
      name: 'Витрина',
      status: 'paired',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  db.insert(mediaAssets)
    .values({
      id: 'ast_sched',
      companyId: COMPANY,
      sha256: 'b'.repeat(64),
      kind: 'image',
      state: 'ready',
      mime: 'image/png',
      bytes: 2048,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  seedPlaylistVersion('pls_base', BASE_VERSION, 'Фоновая программа', 1)
  seedPlaylistVersion('pls_promo', PROMO_VERSION, 'Акция', 1)

  // Постоянная программа на всю компанию: то, что показывается без кампаний.
  db.insert(releaseAssignments)
    .values({
      id: 'asg_sched',
      companyId: COMPANY,
      scopeType: 'company',
      scopeId: COMPANY,
      playlistVersionId: BASE_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  invalidatePlanCache()
}

function campaignInput(overrides: Partial<CampaignInput> = {}): CampaignInput {
  return {
    name: 'Акция',
    kind: 'commercial',
    priority: 10,
    startsOn: '2026-03-01',
    endsOn: '2026-03-31',
    approvalRequired: false,
    playlistVersionId: PROMO_VERSION,
    fallbackPlaylistVersionId: null,
    timezoneOverride: null,
    targets: [{ scopeType: 'company', scopeId: COMPANY }],
    windows: [],
    ...overrides,
  }
}

function createCampaignWith(overrides: Partial<CampaignInput> = {}): string {
  const { id } = createCampaign({ companyId: COMPANY, actorUserId: OWNER, input: campaignInput(overrides) })
  return id
}

/**
 * Сроки вокруг текущего дня.
 *
 * Насос работает по реальному времени, а не по фиксированной дате теста:
 * кампания с прошедшим сроком не создала бы смены программы, и проверка
 * прошла бы не по той причине, ради которой написана.
 */
function aroundToday(): { startsOn: string; endsOn: string } {
  const today = localDateString(new Date(), 'Asia/Tashkent')
  return { startsOn: today, endsOn: addDays(today, 30) }
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

beforeEach(() => {
  wipeAllTables()
  seedFixture()
})

describe('разрешение расписания на настоящей базе', () => {
  it('без кампаний показывает постоянное назначение', () => {
    expect(planForScreen(COMPANY, SCREEN, AT).playlistVersionId).toBe(BASE_VERSION)
  })

  it('активная кампания перебивает постоянное назначение', () => {
    createCampaignWith()

    const plan = planForScreen(COMPANY, SCREEN, AT)

    expect(plan.playlistVersionId).toBe(PROMO_VERSION)
    expect(plan.resolution.campaignName).toBe('Акция')
  })

  it('вне окна показа возвращает постоянную программу', () => {
    // 09:00–10:00 по времени филиала, а проверяем в 12:30 UTC (17:30 в Ташкенте).
    createCampaignWith({ windows: [{ daysOfWeek: 127, startMinute: 540, endMinute: 600, timezoneSource: 'branch' }] })

    expect(planForScreen(COMPANY, SCREEN, AT).playlistVersionId).toBe(BASE_VERSION)
  })

  it('внутри окна показывает кампанию', () => {
    // 12:30 UTC — это 17:30 в Ташкенте, окно 17:00–18:00.
    createCampaignWith({ windows: [{ daysOfWeek: 127, startMinute: 1020, endMinute: 1080, timezoneSource: 'branch' }] })

    expect(planForScreen(COMPANY, SCREEN, AT).playlistVersionId).toBe(PROMO_VERSION)
  })

  it('день недели маски учитывается: в другой день кампания не идёт', () => {
    // 2026-03-10 — вторник (бит 1). Окно только по понедельникам.
    createCampaignWith({ windows: [{ daysOfWeek: 1 << 0, startMinute: 0, endMinute: 1439, timezoneSource: 'branch' }] })

    expect(planForScreen(COMPANY, SCREEN, AT).playlistVersionId).toBe(BASE_VERSION)
  })

  it('при пересечении двух кампаний побеждает более приоритетная', () => {
    createCampaignWith({ name: 'Фоновая реклама', priority: 1 })
    createCampaignWith({ name: 'Срочная акция', priority: 5 })

    const plan = planForScreen(COMPANY, SCREEN, AT)

    expect(plan.resolution.campaignName).toBe('Срочная акция')
    // Остальные кандидаты не теряются: оператор видит, что могло бы пойти вместо.
    expect(plan.resolution.chain.map((entry) => entry.campaignName)).toEqual(['Срочная акция', 'Фоновая реклама'])
  })

  it('результат воспроизводим: тот же вход даёт тот же ответ', () => {
    createCampaignWith()
    createCampaignWith({ name: 'Вторая', priority: 5 })

    invalidatePlanCache()
    const first = planForScreen(COMPANY, SCREEN, AT)

    invalidatePlanCache()
    const second = planForScreen(COMPANY, SCREEN, AT)

    expect(second.resolution.campaignId).toBe(first.resolution.campaignId)
    expect(second.playlistVersionId).toBe(first.playlistVersionId)
  })

  it('смена часового пояса филиала сдвигает окно', () => {
    // Окно 09:00–16:00 по зоне экрана. В 12:30 UTC это 17:30 в Ташкенте (вне окна)
    // и 15:30 в Москве (внутри окна).
    createCampaignWith({ windows: [{ daysOfWeek: 127, startMinute: 540, endMinute: 960, timezoneSource: 'branch' }] })

    expect(planForScreen(COMPANY, SCREEN, AT).playlistVersionId).toBe(BASE_VERSION)

    db.update(branches).set({ timezone: 'Europe/Moscow' }).where(eq(branches.id, BRANCH)).run()
    invalidatePlanCache()

    expect(planForScreen(COMPANY, SCREEN, AT).playlistVersionId).toBe(PROMO_VERSION)
  })

  it('кампания вне сроков не показывается даже при высоком приоритете', () => {
    createCampaignWith({ startsOn: '2026-04-01', endsOn: '2026-04-30' })

    expect(planForScreen(COMPANY, SCREEN, AT).playlistVersionId).toBe(BASE_VERSION)
  })
})

describe('манифест с учётом расписания', () => {
  it('кладёт в манифест момент следующей смены программы', () => {
    // 12:50 UTC — это 17:50 по Ташкенту, окно 09:00–18:00. Через 10 минут программа
    // вернётся к постоянной — и телевизор обязан знать об этом заранее.
    createCampaignWith({
      windows: [{ daysOfWeek: 127, startMinute: 540, endMinute: 1080, timezoneSource: 'branch' }],
    })

    const now = new Date('2026-03-10T12:50:00Z')
    const manifest = buildScreenManifest(COMPANY, SCREEN, 1, now)

    expect(manifest).not.toBeNull()
    expect(manifest?.nextChangeAt).not.toBeNull()

    const changeAt = new Date(manifest!.nextChangeAt!).getTime()
    expect(changeAt).toBeGreaterThan(now.getTime())
    expect(changeAt).toBeLessThanOrEqual(now.getTime() + 15 * 60_000)
  })

  it('не показывает кампанию, файлы которой ещё не готовы', () => {
    createCampaignWith()

    db.update(mediaAssets)
      .set({ state: 'processing' })
      .where(eq(mediaAssets.id, 'ast_sched'))
      .run()
    invalidatePlanCache()

    // Постоянная программа использует тот же файл, поэтому манифеста нет вовсе:
    // экран покажет «нет назначенного контента», а не битый файл.
    expect(buildScreenManifest(COMPANY, SCREEN, 1, AT)).toBeNull()
  })
})

describe('насос расписания', () => {
  it('выпускает публикацию, когда программа по расписанию сменилась', () => {
    publishCompany(COMPANY, OWNER)
    const before = db.select().from(releases).all().length

    createCampaignWith(aroundToday())

    runSchedulePumpOnce()

    const after = db.select().from(releases).all()
    expect(after).toHaveLength(before + 1)
    expect(after[after.length - 1]?.reason).toContain('расписанию')

    const publication = db
      .select()
      .from(screenPublications)
      .where(eq(screenPublications.screenId, SCREEN))
      .get()

    expect(publication?.playlistVersionId).toBe(PROMO_VERSION)
  })

  it('не публикует экран, которому оператор ещё ничего не публиковал', () => {
    createCampaignWith()

    runSchedulePumpOnce()

    // Назначение и публикация — разные действия. Пока оператор не нажал
    // «опубликовать», фоновая смена не должна выкладывать контент на сеть.
    expect(db.select().from(releases).all()).toHaveLength(0)
  })

  it('не выпускает новую публикацию, если программа не менялась', () => {
    publishCompany(COMPANY, OWNER)
    const before = db.select().from(releases).all().length

    runSchedulePumpOnce()

    expect(db.select().from(releases).all()).toHaveLength(before)
  })

  it('завершает кампанию с истёкшим сроком', () => {
    const id = createCampaignWith({ startsOn: '2026-03-01', endsOn: '2026-03-02' })

    // Сравнение дат — в зоне компании, а не в UTC: иначе кампания в Ташкенте
    // завершалась бы на пять часов позже, чем по часам магазина.
    expect(finishExpiredCampaigns(new Date('2026-03-05T12:00:00Z'))).toBe(1)

    const row = db.select().from(campaigns).where(eq(campaigns.id, id)).get()
    expect(row?.status).toBe('ended')
  })
})

describe('согласование кампании', () => {
  it('несогласованная кампания не участвует в расписании', () => {
    const { id, status } = createCampaign({ companyId: COMPANY, actorUserId: OWNER, input: campaignInput({ approvalRequired: true }) })

    expect(status).toBe('in_review')
    expect(planForScreen(COMPANY, SCREEN, AT).playlistVersionId).toBe(BASE_VERSION)
    expect(db.select().from(campaigns).where(eq(campaigns.id, id)).get()?.status).toBe('in_review')
  })

  it('публикация кампании создаёт чеки только для её экранов', () => {
    const id = createCampaignWith()

    const published = publishScreens({ companyId: COMPANY, screenIds: [SCREEN], campaignId: id, reason: 'ручная публикация' })

    expect(published.screens).toBe(1)
    expect(db.select().from(releases).all()[0]?.campaignId).toBe(id)
  })
})