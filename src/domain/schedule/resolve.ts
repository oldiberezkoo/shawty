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
import { isWithinWindow, windowIntervals, type ScheduleInterval, type ScheduleWindowInput } from './window'

/** Кампания в том виде, в котором её видит решатель. */
export type CampaignCandidate = {
  id: string
  name: string
  priority: number
  /** Даты в локальном времени зоны источника, формат YYYY-MM-DD. */
  startsOn: string
  endsOn: string | null
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

/** Экран, для которого считается расписание. */
export type ScheduleScreen = {
  id: string
  branchId: string | null
  groupId: string | null
  /** Часовой пояс экрана, если задан: он перебивает филиальный. */
  timezoneOverride: string | null
}

/** Что показывать на экране в конкретный момент. */
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
 * Специфичность области: чем уже, тем сильнее назначение.
 *
 * Экран важнее группы важнее филиала важнее всей компании: оператор, который
 * повесил плейлист на конкретный экран, ожидает именно его содержимого.
 */
const SPECIFICITY: Record<ScopeType, number> = {
  screen: 4,
  group: 3,
  branch: 2,
  company: 1,
}

/** Наибольшая специфичность среди целей кампании, задевающих экран. */
export function specificityFor(targets: CampaignCandidate['targets'], screen: ScheduleScreen): number {
  let best = 0

  for (const target of targets) {
    let matched = 0

    switch (target.scopeType) {
      case 'company':
        matched = SPECIFICITY.company
        break
      case 'branch':
        matched = target.scopeId === screen.branchId ? SPECIFICITY.branch : 0
        break
      case 'group':
        matched = target.scopeId === screen.groupId ? SPECIFICITY.group : 0
        break
      case 'screen':
        matched = target.scopeId === screen.id ? SPECIFICITY.screen : 0
        break
    }

    if (matched > best) best = matched
  }

  return best
}

/** Задевает ли назначение кампании этот экран. */
export function targetMatches(
  targets: CampaignCandidate['targets'],
  screen: ScheduleScreen,
): boolean {
  return specificityFor(targets, screen) > 0
}

/**
 * Даты кампании как инстанты в зоне источника.
 *
 * `ends_on` включён целиком: кампания, заданная «до 15 марта», идёт до
 * полуночи 15-го. Считать концом полночь *15-го* означало бы отнять у
 * оператора целый день.
 */
export function campaignRange(
  campaign: Pick<CampaignCandidate, 'startsOn' | 'endsOn'>,
  timezone: string,
): { start: string; end: string } {
  const start = localMidnight(campaign.startsOn, timezone)

  const end = campaign.endsOn
    ? addCalendarDays(localMidnight(campaign.endsOn, timezone), 1, timezone)
    : // Открытая дата: горизонт расписания всё равно конечен, поэтому
      // бесконечность здесь означала бы «нет верхней границы» и усложняла
      // бы расчёт. Десять лет — с запасом для любого разумного расписания.
      addCalendarDays(start, 3650, timezone)

  return { start: start.toString(), end: end.toString() }
}

/**
 * Активна ли кампания по датам в заданный момент.
 *
 * Границы включены с обеих сторон: день начала входит, день окончания входит.
 */
export function isWithinCampaignDates(
  campaign: Pick<CampaignCandidate, 'startsOn' | 'endsOn'>,
  timezone: string,
  at: InstantLike,
): boolean {
  const { start, end } = campaignRange(campaign, timezone)

  return (
    Temporal.Instant.compare(toInstant(at), Temporal.Instant.from(start)) >= 0 &&
    Temporal.Instant.compare(toInstant(at), Temporal.Instant.from(end)) < 0
  )
}

/** Показывается ли кампания на этом экране прямо сейчас. */
export function isCampaignActiveAt(
  campaign: CampaignCandidate,
  screen: ScheduleScreen,
  timezone: string,
  at: InstantLike,
): boolean {
  if (!targetMatches(campaign.targets, screen)) return false
  if (!isWithinCampaignDates(campaign, timezone, at)) return false

  // Кампания без окон показывается непрерывно в свои даты.
  if (campaign.windows.length === 0) return true

  return campaign.windows.some((window) => isWithinWindow(window, at, timezone))
}

/**
 * Полный сортирующий ключ по §7.2 плана.
 *
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

  return {
    campaignId: winner.id,
    campaignName: winner.name,
    playlistVersionId: winner.playlistVersionId ?? fallbackPlaylistVersionId,
    fallbackPlaylistVersionId: winner.playlistVersionId ? winner.fallbackPlaylistVersionId : null,
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

    if (!current || current.playlistVersionId !== resolution.playlistVersionId) {
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

  // `timeline[1]` — начало второго сегмента, то есть первый момент смены.
  // Нулевой индекс означает, что за горизонт смен не было.
  return timeline.length > 1 ? (timeline[1]?.from ?? null) : null
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

  return campaign.windows.flatMap((window) => {
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
}