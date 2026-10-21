/**
 * Решатель расписания.
 *
 * Единственное место, где решается, **что показывать** на конкретном экране в
 * конкретный момент. Плеер этого не знает и знать не должен: два телевизора с
 * чуть разными версиями плеера обязаны показывать одно и то же.
 *
 * Решение обязано быть **воспроизводимым**: тот же вход и тот же момент дают
 * тот же ответ. Отсюда полный сортирующий ключ с тай-брейкером по
 * идентификатору — без него две одинаковые кампании давали бы разный
 * результат в зависимости от порядка строк в базе, и сеть «мигала» бы сама.
 */
import { Temporal } from '@js-temporal/polyfill'

import type { ScopeType } from '@/db/schema'

import { addCalendarDays, localMidnight, toInstant, type InstantLike } from './timezone'
import { isWithinWindow, mergeIntervals, windowIntervals, type ScheduleInterval, type ScheduleWindowInput } from './window'

/**
 * Статусы, в которых кампания участвует в разрешении.
 *
 * `draft` и `in_review` исключены осознанно: несогласованная кампания не
 * должна попадать на экран даже случайно — иначе «согласование» было бы
 * украшением интерфейса, а не механизмом. Даты и окна проверяются отдельно,
 * здесь важен только статус.
 */
export const LIVE_CAMPAIGN_STATUSES = ['approved', 'scheduled', 'active'] as const

/** Кампания в том виде, в котором её видит решатель. */
export type CampaignCandidate = {
  id: string
  name: string
  priority: number
  /** Даты в локальном времени зоны источника, формат YYYY-MM-DD. */
  startsOn: string
  endsOn: string | null
  /**
   * Точные границы кампании, если оператор задал время вместе с датой.
   * Абсолютные моменты; при наличии заменяют начало/конец суток по датам.
   */
  startsAt?: Date | null
  endsAt?: Date | null
  /** Часовой пояс кампании, если он задан явно; иначе зона филиала. */
  timezoneOverride?: string | null
  /** Назначение кампании — области экранов. */
  targets: { scopeType: ScopeType; scopeId: string }[]
  windows: ScheduleWindowInput[]
  /** Версия плейлиста, которую кампания выводит на экран. */
  playlistVersionId: string | null
  /** Плейлист, если кампания не показывается. */
  fallbackPlaylistVersionId: string | null
}

/** Экран, для которого решается показ. */
export type ScheduleScreen = {
  id: string
  branchId: string
  companyId: string
}

/** Итог решения: что выводить и почему. */
export type ScheduleResolution = {
  /** Победившая кампания; `null` — показывать fallback. */
  campaignId: string | null
  campaignName: string | null
  /** Плейлист, который показывается на самом деле. */
  playlistVersionId: string | null
  /** Плейлист, который не сработал, но остался бы, если бы не было лучшего. */
  fallbackPlaylistVersionId: string | null
  /** Порядок оставшихся кандидатов — для объяснения решения оператору. */
  chain: { campaignId: string; campaignName: string; playlistVersionId: string | null }[]
  timezone: string
}

/**
 * Вес области назначения (§7.2 спецификации).
 * Экран важнее филиала, филиал важнее компании.
 */
export function scopeWeight(scopeType: ScopeType): number {
  switch (scopeType) {
    case 'screen':
      return 30
    case 'branch':
      return 20
    case 'company':
      return 10
    default:
      return 0
  }
}

/** Подходит ли назначение к экрану. */
export function matchesTarget(
  target: { scopeType: ScopeType; scopeId: string },
  screen: ScheduleScreen,
): boolean {
  switch (target.scopeType) {
    case 'screen':
      return target.scopeId === screen.id
    case 'branch':
      return target.scopeId === screen.branchId
    case 'company':
      return target.scopeId === screen.companyId
    default:
      return false
  }
}

/** Максимальная специфичность назначений кампании, подошедших к экрану. */
export function specificityFor(
  targets: readonly { scopeType: ScopeType; scopeId: string }[],
  screen: ScheduleScreen,
): number {
  let best = 0

  for (const target of targets) {
    if (matchesTarget(target, screen)) {
      best = Math.max(best, scopeWeight(target.scopeType))
    }
  }

  return best
}

/**
 * Границы кампании во времени.
 *
 * `starts_on` начинается в 00:00:00 первого дня в локальном времени зоны,
 * `ends_on` — в 24:00:00 последнего дня (полночь следующих суток).
 * Если заданы точные `starts_at`/`ends_at`, они важнее дат — оператор указал
 * не «день», а конкретный промежуток времени.
 * Открытый конец — плюс 100 лет (фактически бесконечность).
 */
export function campaignRange(
  campaign: Pick<CampaignCandidate, 'startsOn' | 'endsOn' | 'startsAt' | 'endsAt'>,
  timezone: string,
): { start: string; end: string } {
  const start = campaign.startsAt
    ? campaign.startsAt.toISOString()
    : localMidnight(campaign.startsOn, timezone).toString()
  const end = campaign.endsAt
    ? campaign.endsAt.toISOString()
    : campaign.endsOn
      ? addCalendarDays(localMidnight(campaign.endsOn, timezone), 1, timezone).toString()
      : addCalendarDays(Temporal.Instant.from(start), 36500, timezone).toString()

  return {
    start: start.toString(),
    end: end.toString(),
  }
}

/** Попадает ли момент `at` в даты кампании. */
export function isWithinCampaignDates(
  campaign: Pick<CampaignCandidate, 'startsOn' | 'endsOn'>,
  timezone: string,
  at: InstantLike,
): boolean {
  const instant = toInstant(at)
  const { start, end } = campaignRange(campaign, timezone)

  return (
    Temporal.Instant.compare(instant, Temporal.Instant.from(start)) >= 0 &&
    Temporal.Instant.compare(instant, Temporal.Instant.from(end)) < 0
  )
}

/** Попадает ли момент `at` в хотя бы одно окно кампании. */
export function isWithinAnyWindow(
  campaign: Pick<CampaignCandidate, 'windows'>,
  timezone: string,
  at: InstantLike,
): boolean {
  if (campaign.windows.length === 0) return true

  return campaign.windows.some((window) => isWithinWindow(window, at, timezone))
}

/** Активна ли кампания на экране в заданный момент. */
export function isCampaignActiveAt(
  campaign: CampaignCandidate,
  screen: ScheduleScreen,
  timezone: string,
  at: InstantLike,
): boolean {
  if (specificityFor(campaign.targets, screen) === 0) return false

  const effectiveZone = campaign.timezoneOverride ?? timezone

  if (!isWithinCampaignDates(campaign, effectiveZone, at)) return false
  if (!isWithinAnyWindow(campaign, effectiveZone, at)) return false

  return true
}

/**
 * Порядок: приоритет → специфичность области → более свежая кампания →
 * идентификатор. Последний шаг обязателен: без него два одинаковых
 * назначения дают результат, зависящий от порядка строк в базе.
 */
/** Кампания вместе с экраном, для которого она считается. */
export type BoundCandidate = CampaignCandidate & { screen: ScheduleScreen }

export function compareCandidates(a: BoundCandidate, b: BoundCandidate): number {
  if (a.priority !== b.priority) return b.priority - a.priority

  const specA = specificityFor(a.targets, a.screen)
  const specB = specificityFor(b.targets, b.screen)

  if (specA !== specB) return specB - specA
  if (a.startsOn !== b.startsOn) return a.startsOn < b.startsOn ? 1 : -1

  return a.id.localeCompare(b.id)
}

/**
 * Что показывать на экране в момент `at`.
 *
 * Сортировка выполняется по правилам §7.2, победитель — первый, остальные
 * идут в цепочку. Если кандидатов нет, показывается fallback; если и его
 * нет — экран показывает экран ожидания, и это нормальное состояние, а не
 * ошибка.
 */
export function resolveSchedule(
  campaigns: readonly CampaignCandidate[],
  screen: ScheduleScreen,
  timezone: string,
  at: InstantLike,
  fallbackPlaylistVersionId: string | null,
): ScheduleResolution {
  const bound: BoundCandidate[] = campaigns
    .map((campaign) => ({ ...campaign, screen }))
    .filter((campaign) => isCampaignActiveAt(campaign, screen, timezone, at))
    .sort(compareCandidates)

  const chain = bound.map((campaign) => ({
    campaignId: campaign.id,
    campaignName: campaign.name,
    playlistVersionId: campaign.playlistVersionId,
  }))

  const winner = bound[0]

  if (!winner) {
    return {
      campaignId: null,
      campaignName: null,
      playlistVersionId: fallbackPlaylistVersionId,
      fallbackPlaylistVersionId: null,
      chain,
      timezone,
    }
  }

  const activePlaylist = winner.playlistVersionId ?? winner.fallbackPlaylistVersionId ?? fallbackPlaylistVersionId
  const remainingFallback = winner.playlistVersionId
    ? (winner.fallbackPlaylistVersionId ?? fallbackPlaylistVersionId)
    : (winner.fallbackPlaylistVersionId ? fallbackPlaylistVersionId : null)

  return {
    campaignId: winner.id,
    campaignName: winner.name,
    playlistVersionId: activePlaylist,
    fallbackPlaylistVersionId: remainingFallback,
    chain,
    timezone,
  }
}

/**
 * Интервалы, в которые на экране меняется программа.
 *
 * Это то, что показывает календарь расписания и из чего выводится
 * `nextChangeAt`. Считается по переходу «что было до интервала → что будет»,
 * а не по интервалам окон: две кампании с одинаковым плейлистом не должны
 * порождать ложную смену.
 */
export type ChangeSegment = {
  from: string
  to: string
  campaignId: string | null
  playlistVersionId: string | null
}

/**
 * Таймлайн изменений на горизонте.
 *
 * Границы задаются шагом `stepMs` по всей длине горизонта. Шаг — не точность
 * измерения, а экономия: перебор всех интервалов окон потребовал бы часов
 * работы решателя на неделю вперёд, а изменение программы длится минуты, не
 * секунды. По умолчанию 15 минут — грубо для события, которое длится дни.
 */
export function buildTimeline(
  campaigns: readonly CampaignCandidate[],
  screen: ScheduleScreen,
  timezone: string,
  from: InstantLike,
  to: InstantLike,
  fallbackPlaylistVersionId: string | null,
  stepMs = 15 * 60_000,
  options: { attribute?: 'playlist' | 'campaign' } = {},
): ChangeSegment[] {
  const start = toInstant(from)
  const end = toInstant(to)

  const segments: ChangeSegment[] = []
  const step = Math.max(1, Math.round(stepMs))

  // Курсор кратен шагу от начала эпохи: иначе границы сегментов зависели бы
  // от того, с какого момента посчитали таймлайн, и две разные выборки
  // «за неделю» различались бы на минуту.
  let cursorMs = Math.floor(start.epochMilliseconds / step) * step
  let current: ScheduleResolution | null = null

  while (cursorMs < end.epochMilliseconds) {
    const at = Temporal.Instant.fromEpochMilliseconds(cursorMs)
    const resolution = resolveSchedule(campaigns, screen, timezone, at, fallbackPlaylistVersionId)

    // Что считать сменой программы — по умолчанию смена плейлиста. Именно так
    // работает `nextChangeAt`: телевизору нужен момент, когда показ другой, и
    // две кампании с одним плейлистом переключать экран не должны.
    //
    // Календарь в интерфейсе, наоборот, различает кампании: оператор смотрит
    // «что за акция идёт», и одна программа под двумя названиями — это разные
    // отрезки расписания.
    const byCampaign = options.attribute === 'campaign'
    const changed = !current
      ? true
      : byCampaign
        ? current.campaignId !== resolution.campaignId
        : current.playlistVersionId !== resolution.playlistVersionId

    if (changed) {
      const last = segments[segments.length - 1]
      if (last) last.to = at.toString()

      segments.push({
        from: at.toString(),
        to: end.toString(),
        campaignId: resolution.campaignId,
        playlistVersionId: resolution.playlistVersionId,
      })

      current = resolution
    }

    cursorMs += step
  }

  return segments
}

/**
 * Момент следующей смены программы на экране.
 *
 * Телевизор узнаёт его заранее и готовит следующий манифест до того, как
 * придёт время переключения: иначе переход был бы минутой чёрного экрана
 * ровно в момент смены рекламы.
 *
 * Граница поиска — конец горизонта. Если смены не будет, это честное «не
 * знаю», и `null` в манифесте лучше выдуманного момента в далёком будущем.
 */
export function nextChangeAt(
  campaigns: readonly CampaignCandidate[],
  screen: ScheduleScreen,
  timezone: string,
  from: InstantLike,
  horizonDays = 7,
  stepMs = 15 * 60_000,
): string | null {
  const start = toInstant(from)
  const horizon = addCalendarDays(start, horizonDays, timezone)

  const timeline = buildTimeline(
    campaigns,
    screen,
    timezone,
    start,
    horizon,
    null,
    stepMs,
  )

  // Ищем первый момент смены, строго превышающий момент `start`.
  const futureChange = timeline.find((segment) => Temporal.Instant.compare(Temporal.Instant.from(segment.from), start) > 0)
  return futureChange ? futureChange.from : null
}

/**
 * Все интервалы показа кампании в диапазоне — для календаря в интерфейсе.
 *
 * Окна разных кампаний объединять нельзя: календарь показывает, что
 * *каждая* кампания идёт в своё время, иначе пересечения становились бы
 * неразличимы.
 */
export function campaignIntervals(
  campaign: CampaignCandidate,
  timezone: string,
  from: InstantLike,
  to: InstantLike,
): ScheduleInterval[] {
  const range = campaignRange(campaign, timezone)

  if (range.end <= toInstant(from).toString() || range.start >= toInstant(to).toString()) return []
  if (campaign.windows.length === 0) {
    return [
      {
        start: toInstant(from).toString() > range.start ? toInstant(from).toString() : range.start,
        end: toInstant(to).toString() < range.end ? toInstant(to).toString() : range.end,
      },
    ]
  }

  const intervals = campaign.windows.flatMap((window) => {
    const intervals = windowIntervals(window, from, to, timezone)

    // Отсекаем то, что не попадает в даты кампании: окно могло быть задано
    // шире, чем срок кампании.
    return intervals
      .map((interval) => ({
        start: interval.start > range.start ? interval.start : range.start,
        end: interval.end < range.end ? interval.end : range.end,
      }))
      .filter((interval) => interval.start < interval.end)
  })

  return mergeIntervals(intervals)
}
