/**
 * Мост между доменным решателем расписания и базой.
 *
 * Здесь и только здесь кампании и назначения превращаются в кандидатов для
 * `domain/schedule`, а результат решения — в номер версии плейлиста, который
 * покажет конкретный экран.
 *
 * Правило продукта: решает сервер. Плеер не знает про кампании, приоритеты и
 * пересечения окон — иначе два телевизора с чуть разными версиями плеера
 * показали бы разное в один и тот же момент.
 */
import { and, asc, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  branches,
  campaigns,
  campaignTargets,
  companies,
  playlistVersions,
  playlists,
  releaseAssignments,
  scheduleWindows,
  screens,
  screenPublications,
} from '@/db/schema'
import { serverConfig } from '@/config/server'
import {
  buildTimeline,
  campaignIntervals,
  LIVE_CAMPAIGN_STATUSES,
  nextChangeAt,
  resolveSchedule,
  type CampaignCandidate,
  type ScheduleResolution,
  type ScheduleScreen,
} from '@/domain/schedule/resolve'
import {
  FALLBACK_TIMEZONE,
  localDateString,
  resolveTimezone,
  type InstantLike,
} from '@/domain/schedule/timezone'
import { HttpError } from '@/server/http/errors'

/** Назначение плейлиста на область — постоянная программа без расписания. */
export type Assignment = typeof releaseAssignments.$inferSelect

/**
 * Раскрытие области в конкретные экраны.
 *
 * Общее для назначений и кампаний: правило «область — это экраны» одно, и
 * две его копии рано или поздно разошлись бы. Отказ отозванных экранов —
 * потому что отвязанное устройство не должно ни показывать контент, ни
 * попадать в чеки новой публикации.
 */
export function resolveScreens(companyId: string, scopeType: string, scopeId: string): string[] {
  const conditions = [eq(screens.companyId, companyId), ne(screens.status, 'revoked')]

  switch (scopeType) {
    case 'company':
      break
    case 'branch':
      conditions.push(eq(screens.branchId, scopeId))
      break
    case 'group':
      conditions.push(eq(screens.groupId, scopeId))
      break
    case 'screen':
      conditions.push(eq(screens.id, scopeId))
      break
    default:
      throw HttpError.badRequest('invalid_scope', 'Неизвестная область назначения')
  }

  return db
    .select({ id: screens.id })
    .from(screens)
    .where(and(...conditions))
    .orderBy(asc(screens.id))
    .all()
    .map((row) => row.id)
}

/**
 * Кандидаты кампаний компании для решателя.
 *
 * Загружаются одним проходом по трём таблицам, а не запросом на кампанию:
 * публикация на сеть из 80 экранов иначе сделала бы сотни одинаковых
 * выборок и разбирала бы окна по одной.
 */
export function loadCandidates(companyId: string): CampaignCandidate[] {
  const live = db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      priority: campaigns.priority,
      startsOn: campaigns.startsOn,
      endsOn: campaigns.endsOn,
      startsAt: campaigns.startsAt,
      endsAt: campaigns.endsAt,
      timezoneOverride: campaigns.timezoneOverride,
      playlistVersionId: campaigns.playlistVersionId,
      fallbackPlaylistVersionId: campaigns.fallbackPlaylistVersionId,
    })
    .from(campaigns)
    .where(and(eq(campaigns.companyId, companyId), inArray(campaigns.status, [...LIVE_CAMPAIGN_STATUSES])))
    .orderBy(asc(campaigns.id))
    .all()

  if (live.length === 0) return []

  const ids = live.map((row) => row.id)

  const targets = db
    .select({
      campaignId: campaignTargets.campaignId,
      scopeType: campaignTargets.scopeType,
      scopeId: campaignTargets.scopeId,
    })
    .from(campaignTargets)
    .where(inArray(campaignTargets.campaignId, ids))
    .all()

  const windows = db
    .select({
      campaignId: scheduleWindows.campaignId,
      daysOfWeek: scheduleWindows.daysOfWeek,
      startMinute: scheduleWindows.startMinute,
      endMinute: scheduleWindows.endMinute,
    })
    .from(scheduleWindows)
    .where(inArray(scheduleWindows.campaignId, ids))
    .all()

  const targetsByCampaign = new Map<string, CampaignCandidate['targets']>()
  const windowsByCampaign = new Map<string, CampaignCandidate['windows']>()

  for (const target of targets) {
    const list = targetsByCampaign.get(target.campaignId) ?? []
    list.push({ scopeType: target.scopeType, scopeId: target.scopeId })
    targetsByCampaign.set(target.campaignId, list)
  }

  for (const window of windows) {
    const list = windowsByCampaign.get(window.campaignId) ?? []
    list.push({ daysOfWeek: window.daysOfWeek, startMinute: window.startMinute, endMinute: window.endMinute })
    windowsByCampaign.set(window.campaignId, list)
  }

  return live.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    priority: campaign.priority,
    startsOn: campaign.startsOn,
    endsOn: campaign.endsOn,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    timezoneOverride: campaign.timezoneOverride,
    playlistVersionId: campaign.playlistVersionId,
    fallbackPlaylistVersionId: campaign.fallbackPlaylistVersionId,
    targets: targetsByCampaign.get(campaign.id) ?? [],
    windows: windowsByCampaign.get(campaign.id) ?? [],
  }))
}

/**
 * Выбор постоянного назначения для экрана.
 *
 * Порядок §7 плана: приоритет → специфичность области → идентификатор.
 * Тай-брейкер обязателен: без него два одинаковых назначения дали бы
 * результат, зависящий от порядка строк в базе, и сеть «мигала» бы сама.
 */
const SPECIFICITY: Record<string, number> = {
  screen: 4,
  group: 3,
  branch: 2,
  company: 1,
}

export function pickAssignment(companyId: string, screenId: string): Assignment | null {
  const screen = db.select().from(screens).where(eq(screens.id, screenId)).get()
  if (!screen) return null

  const candidates = db
    .select()
    .from(releaseAssignments)
    .where(eq(releaseAssignments.companyId, companyId))
    .all()

  if (candidates.length === 0) return null

  const matches = candidates.filter((assignment) => {
    switch (assignment.scopeType) {
      case 'company':
        return true
      case 'branch':
        return assignment.scopeId === screen.branchId
      case 'group':
        return assignment.scopeId === screen.groupId
      case 'screen':
        return assignment.scopeId === screenId
      default:
        return false
    }
  })

  if (matches.length === 0) return null

  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const specA = SPECIFICITY[a.scopeType] ?? 0
    const specB = SPECIFICITY[b.scopeType] ?? 0
    if (specB !== specA) return specB - specA
    return a.id.localeCompare(b.id)
  })

  return matches[0] ?? null
}

export type ScreenZone = {
  screenId: string
  screenName: string
  branchId: string | null
  timezone: string
  timezoneSource: 'screen' | 'branch' | 'company' | 'fallback'
}

/**
 * Часовой пояс экрана по приоритету: экран → филиал → компания.
 *
 * Филиалы в Узбекистане исторически жили в разных зонах, и в сети одной
 * компании они будут разными: окно «с 9:00» в Самарканде и в Ташкенте — это
 * разные моменты времени, хотя цифры выглядят одинаково.
 */
export function screenZone(companyId: string, screenId: string): ScreenZone {
  const screen = db.select().from(screens).where(eq(screens.id, screenId)).get()
  if (!screen || screen.companyId !== companyId) {
    throw HttpError.notFound('Экран не найден')
  }

  const branch = screen.branchId
    ? db.select({ timezone: branches.timezone }).from(branches).where(eq(branches.id, screen.branchId)).get()
    : undefined

  const company = db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .get()

  const resolved = resolveTimezone({
    screenOverride: screen.timezoneOverride,
    branch: branch?.timezone,
    company: company?.timezone,
  })

  return {
    screenId: screen.id,
    screenName: screen.name,
    branchId: screen.branchId,
    timezone: resolved.timezone,
    timezoneSource: resolved.source,
  }
}

/** Все рабочие экраны компании вместе с их зонами. */
export function companyScreenZones(companyId: string): ScreenZone[] {
  const companyZone = db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .get()

  const branchRows = db
    .select({ id: branches.id, timezone: branches.timezone })
    .from(branches)
    .where(eq(branches.companyId, companyId))
    .all()

  const branchZones = new Map(branchRows.map((branch) => [branch.id, branch.timezone]))

  return db
    .select({
      id: screens.id,
      name: screens.name,
      branchId: screens.branchId,
      timezoneOverride: screens.timezoneOverride,
    })
    .from(screens)
    .where(and(eq(screens.companyId, companyId), ne(screens.status, 'revoked')))
    .orderBy(asc(screens.name))
    .all()
    .map((screen) => {
      const resolved = resolveTimezone({
        screenOverride: screen.timezoneOverride,
        branch: screen.branchId ? branchZones.get(screen.branchId) : null,
        company: companyZone?.timezone,
      })

      return {
        screenId: screen.id,
        screenName: screen.name,
        branchId: screen.branchId,
        timezone: resolved.timezone,
        timezoneSource: resolved.source,
      }
    })
}

export type ScreenPlan = {
  screen: ScreenZone
  resolution: ScheduleResolution
  /** Версия плейлиста, которую показывает экран сейчас. */
  playlistVersionId: string | null
  /** Момент следующей смены программы; `null` — в пределах горизонта смен нет. */
  nextChangeAt: Date | null
}

/**
 * Кэш плана по экранам.
 *
 * План считается на горизонт в неделю шагом в 15 минут: на сеть из 80
 * экранов это десятки тысяч проверок окон на каждую публикацию. Результат
 * при этом меняется медленно — расписание не меняется само по себе, — поэтому
 * кэш на полминуты невидим для оператора и снимает основную стоимость.
 * Любая правка кампаний или назначений сбрасывает кэш явно.
 */
const PLAN_TTL_MS = 30_000
const planCache = new Map<string, { expiresAt: number; plan: ScreenPlan }>()

export function invalidatePlanCache(companyId?: string): void {
  if (!companyId) {
    planCache.clear()
    return
  }

  for (const key of [...planCache.keys()]) {
    if (key.startsWith(`${companyId}:`)) planCache.delete(key)
  }
}

function scheduleScreenOf(companyId: string, zone: ScreenZone): ScheduleScreen {
  return { id: zone.screenId, branchId: zone.branchId ?? '', companyId }
}

/** План показа для одного экрана: что и когда на нём будет. */
export function planForScreen(
  companyId: string,
  screenId: string,
  at: InstantLike = new Date(),
  candidates?: CampaignCandidate[],
): ScreenPlan {
  const key = `${companyId}:${screenId}`
  const cached = planCache.get(key)

  if (cached && cached.expiresAt > Date.now()) return cached.plan

  const zone = screenZone(companyId, screenId)
  const fallback = pickAssignment(companyId, screenId)?.playlistVersionId ?? null
  const list = candidates ?? loadCandidates(companyId)
  const scheduleScreen = scheduleScreenOf(companyId, zone)

  const resolution = resolveSchedule(list, scheduleScreen, zone.timezone, at, fallback)
  const upcoming = nextChangeAt(list, scheduleScreen, zone.timezone, at, serverConfig.player.scheduleHorizonDays)

  const plan: ScreenPlan = {
    screen: zone,
    resolution,
    playlistVersionId: resolution.playlistVersionId,
    nextChangeAt: upcoming ? new Date(upcoming) : null,
  }

  planCache.set(key, { expiresAt: Date.now() + PLAN_TTL_MS, plan })

  return plan
}

/** Название версии плейлиста для интерфейса: без него «версия 3» — бессмыслица. */
export function describePlaylistVersion(versionId: string | null): { id: string; name: string; version: number } | null {
  if (!versionId) return null

  const row = db
    .select({ id: playlistVersions.id, version: playlistVersions.version, name: playlists.name })
    .from(playlistVersions)
    .innerJoin(playlists, eq(playlists.id, playlistVersions.playlistId))
    .where(eq(playlistVersions.id, versionId))
    .get()

  return row ? { id: row.id, name: row.name, version: row.version } : null
}

/** Текущее состояние публикации экрана: что показывает и что должно сменить. */
export function publicationState(companyId: string, screenId: string, at: InstantLike = new Date()) {
  const publication = db.select().from(screenPublications).where(eq(screenPublications.screenId, screenId)).get()
  const plan = planForScreen(companyId, screenId, at)

  return {
    screen: plan.screen,
    // Расписание требует смены: желаемая версия плейлиста не совпадает с той,
    // что уже выложена на экран. Именно это и запускает новую публикацию.
    needsChange: (publication?.playlistVersionId ?? null) !== plan.playlistVersionId,
    desiredVersion: publication?.desiredVersion ?? null,
    appliedVersion: publication?.appliedVersion ?? null,
    appliedAt: publication?.appliedAt ?? null,
    publishedPlaylistVersionId: publication?.playlistVersionId ?? null,
    nextChangeAt: plan.nextChangeAt,
    resolution: plan.resolution,
  }
}

export type ScheduleChange = {
  companyId: string
  screenId: string
  screenName: string
  wantedPlaylistVersionId: string | null
}

/**
 * Экраны, у которых программа по расписанию должна смениться.
 *
 * Насос расписания работает по этому списку: он создаёт публикацию ровно для
 * тех экранов, у которых программа по расписанию отличается от выложенной.
 * Проверка идёт по версии плейлиста, а не по хешу манифеста: подписи на
 * файлах перевыпускаются каждый час, и сравнение хешей давало бы ложную
 * «смену программы» дважды за час.
 */
export function screensNeedingScheduleChange(now: Date = new Date()): ScheduleChange[] {
  const companiesWithScreens = db
    .selectDistinct({ companyId: screens.companyId })
    .from(screens)
    .where(ne(screens.status, 'revoked'))
    .all()

  const changes: ScheduleChange[] = []

  for (const { companyId } of companiesWithScreens) {
    const candidates = loadCandidates(companyId)
    const published = new Map(
      db
        .select({ screenId: screenPublications.screenId, playlistVersionId: screenPublications.playlistVersionId })
        .from(screenPublications)
        .all()
        .map((row) => [row.screenId, row.playlistVersionId ?? null]),
    )

    for (const zone of companyScreenZones(companyId)) {
      const plan = planForScreen(companyId, zone.screenId, now, candidates)
      const current = published.get(zone.screenId) ?? null

      if (current === plan.playlistVersionId) continue

      changes.push({
        companyId,
        screenId: zone.screenId,
        screenName: zone.screenName,
        wantedPlaylistVersionId: plan.playlistVersionId,
      })
    }
  }

  return changes
}

/** Календарь показа для экрана: отрезки с разными кампаниями на горизонте. */
export function schedulePreview(params: { companyId: string; screenId: string; from: Date; days: number }) {
  const zone = screenZone(params.companyId, params.screenId)
  const candidates = loadCandidates(params.companyId)
  const fallback = pickAssignment(params.companyId, params.screenId)?.playlistVersionId ?? null
  const scheduleScreen = scheduleScreenOf(params.companyId, zone)

  const to = new Date(params.from.getTime() + params.days * 24 * 60 * 60_000)

  return {
    screen: zone,
    from: params.from.toISOString(),
    to: to.toISOString(),
    days: params.days,
    // Что реально идёт на экране, отрезками. Отрезки различаются по кампании,
    // а не по плейлисту: календарь отвечает на вопрос «какая акция идёт», и две
    // кампании с одинаковым плейлистом — это две разные акции.
    segments: buildTimeline(
      candidates,
      scheduleScreen,
      zone.timezone,
      params.from,
      to,
      fallback,
      undefined,
      { attribute: 'campaign' },
    ),
    // И отдельно графики всех кампаний: без них пересечение двух расписаний
    // выглядит в интерфейсе как «ничего не показывается».
    campaigns: candidates.map((campaign) => ({
      campaignId: campaign.id,
      name: campaign.name,
      priority: campaign.priority,
      playlistVersionId: campaign.playlistVersionId,
      intervals: campaignIntervals(campaign, zone.timezone, params.from, to),
    })),
    nextChangeAt: planForScreen(params.companyId, params.screenId, params.from, candidates).nextChangeAt?.toISOString() ?? null,
  }
}
/**
 * Завершение кампаний с истёкшим сроком.
 *
 * Дата сравнивается в зоне компании, а не в UTC: «до 15 марта» в Ташкенте
 * заканчивается в полночь по ташкентскому времени, и в UTC это было бы
 * пять часов спустя — кампания доиграла бы лишние часы.
 *
 * Проверка по датам всё равно есть в решателе: статус `ended` здесь нужен
 * интерфейсу и отчётам, а не показу.
 */
export function finishExpiredCampaigns(now: Date = new Date()): number {
  const rows = db
    .select({ id: campaigns.id, endsOn: campaigns.endsOn, timezone: companies.timezone })
    .from(campaigns)
    .innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(inArray(campaigns.status, [...LIVE_CAMPAIGN_STATUSES]), isNotNull(campaigns.endsOn)))
    .all()

  const expired = rows
    .filter((row) => row.endsOn !== null && localDateString(now, row.timezone) > (row.endsOn as string))
    .map((row) => row.id)

  if (expired.length === 0) return 0

  db.update(campaigns)
    .set({ status: 'ended', updatedAt: new Date() })
    .where(inArray(campaigns.id, expired))
    .run()

  return expired.length
}

/**
 * Сегодняшняя дата в зоне компании.
 *
 * Кампания задана датами без времени, и «истекла ли она» — вопрос календаря
 * оператора, а не сервера. В UTC та же кампания выглядела бы завершённой на
 * несколько часов раньше, чем закончилась по часам магазина.
 */
export function companyToday(companyId: string, now: Date = new Date()): string {
  const row = db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .get()

  return localDateString(now, row?.timezone ?? FALLBACK_TIMEZONE)
}
