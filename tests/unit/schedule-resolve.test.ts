/**
 * Решатель расписания.
 *
 * Приёмка P5 требует ровно трёх вещей: пересекающиеся расписания дают
 * стабильный результат, смена часового пояса меняет окна, и результат
 * воспроизводим при повторном расчёте с тем же входом. Здесь проверяется
 * каждая из них, включая перевод стрелки — где наивная арифметика по часовому
 * смещению расходится с реальным расписанием на час.
 */
import { describe, expect, it } from 'vitest'

import {
  buildTimeline,
  campaignIntervals,
  campaignRange,
  isCampaignActiveAt,
  nextChangeAt,
  resolveSchedule,
  specificityFor,
  type CampaignCandidate,
  type ScheduleScreen,
} from '@/domain/schedule/resolve'
import { isValidTimezone, resolveTimezone } from '@/domain/schedule/timezone'
import { isValidWindow, isWithinWindow, mergeIntervals, windowIntervals, type ScheduleWindowInput } from '@/domain/schedule/window'

const TASHKENT = 'Asia/Tashkent'
const BERLIN = 'Europe/Berlin'

const EVERY_DAY = 127
const MONDAY_FRIDAY = 0b0011111
const WEEKEND = 0b1100000

const ALL_DAY: ScheduleWindowInput = { daysOfWeek: EVERY_DAY, startMinute: 0, endMinute: 1439 }
const WORKING_HOURS: ScheduleWindowInput = {
  daysOfWeek: MONDAY_FRIDAY,
  startMinute: 9 * 60,
  endMinute: 18 * 60,
}

function screen(overrides: Partial<ScheduleScreen> = {}): ScheduleScreen {
  return {
    id: 'scr_main',
    branchId: 'brn_main',
    companyId: 'cmp_org',
    ...overrides,
  }
}

function campaign(overrides: Partial<CampaignCandidate> = {}): CampaignCandidate {
  return {
    id: 'cmp_a',
    name: 'Кампания А',
    priority: 1,
    startsOn: '2026-10-01',
    endsOn: '2026-10-31',
    targets: [{ scopeType: 'company', scopeId: 'cmp_org' }],
    windows: [],
    playlistVersionId: 'pvr_a',
    fallbackPlaylistVersionId: null,
    ...overrides,
  }
}

describe('часовые пояса', () => {
  it('принимает известные зоны и отбрасывает выдуманные', () => {
    expect(isValidTimezone('Europe/Moscow')).toBe(true)
    expect(isValidTimezone('Asia/Tashkent')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone(null)).toBe(false)
  })

  it('приоритет: экран важнее филиала, филиал важнее компании', () => {
    expect(resolveTimezone({ screenOverride: 'Europe/Berlin', branch: 'Asia/Tashkent' }).timezone).toBe('Europe/Berlin')
    expect(resolveTimezone({ branch: 'Asia/Tashkent', company: 'UTC' }).timezone).toBe('Asia/Tashkent')
    expect(resolveTimezone({ company: 'UTC' }).timezone).toBe('UTC')
  })

  it('неизвестная зона не сдвигает расписание молча', () => {
    // Ошибочная зона опаснее отсутствующей: сдвиг обнаруживается через неделю.
    expect(resolveTimezone({ screenOverride: 'Nope/Nope', branch: TASHKENT }).timezone).toBe(TASHKENT)
    expect(resolveTimezone({ screenOverride: 'Nope/Nope', branch: TASHKENT }).source).toBe('branch')
    expect(resolveTimezone({}).source).toBe('fallback')
  })
})

describe('окна показа', () => {
  it('отбрасывает бессмысленные окна', () => {
    expect(isValidWindow(ALL_DAY)).toBe(true)
    expect(isValidWindow({ daysOfWeek: 0, startMinute: 0, endMinute: 10 })).toBe(false)
    expect(isValidWindow({ daysOfWeek: 128, startMinute: 0, endMinute: 10 })).toBe(false)
    expect(isValidWindow({ daysOfWeek: 127, startMinute: -1, endMinute: 10 })).toBe(false)
    expect(isValidWindow({ daysOfWeek: 127, startMinute: 0, endMinute: 1440 })).toBe(false)
    // Нулевая длина — это не «круглосуточно», а «никогда»; отличить одно
    // от другого должен автор, а не система молча.
    expect(isValidWindow({ daysOfWeek: 127, startMinute: 600, endMinute: 600 })).toBe(false)
  })

  it('учитывает дни недели в локальном времени зоны', () => {
    // 2026-10-12 — понедельник, 09:00 по Ташкенту.
    expect(isWithinWindow(WORKING_HOURS, '2026-10-12T04:00:00Z', TASHKENT)).toBe(true)
    // Та же минута в Берлине — 11:00, тоже внутри.
    expect(isWithinWindow(WORKING_HOURS, '2026-10-12T09:00:00Z', BERLIN)).toBe(true)
    // Суббота по ташкентскому времени — вне окна.
    expect(isWithinWindow(WORKING_HOURS, '2026-10-17T04:00:00Z', TASHKENT)).toBe(false)
  })

  it('окно через полночь относится к дню начала, а не к текущему', () => {
    const night: ScheduleWindowInput = { daysOfWeek: 1 << 0, startMinute: 22 * 60, endMinute: 6 * 60 }

    // Вторник 01:00 по Ташкенту — это «ночь понедельника», окно открыто.
    expect(isWithinWindow(night, '2026-10-12T20:00:00Z', TASHKENT)).toBe(true)
    // Вторник 12:00 по Ташкенту — окно закрыто.
    expect(isWithinWindow(night, '2026-10-12T07:00:00Z', TASHKENT)).toBe(false)
    // Понедельник 12:00 — до начала окна.
    expect(isWithinWindow(night, '2026-10-11T07:00:00Z', TASHKENT)).toBe(false)
  })

  it('разворачивает окно в интервалы и склеивает соседние', () => {
    const first: ScheduleWindowInput = { daysOfWeek: EVERY_DAY, startMinute: 9 * 60, endMinute: 12 * 60 }
    const second: ScheduleWindowInput = { daysOfWeek: EVERY_DAY, startMinute: 12 * 60, endMinute: 15 * 60 }

    const from = '2026-10-12T00:00:00Z'
    const to = '2026-10-14T00:00:00Z'

    const merged = mergeIntervals([...windowIntervals(first, from, to, TASHKENT), ...windowIntervals(second, from, to, TASHKENT)])

    expect(merged.length).toBe(2)
    expect(merged[0]?.start).toBe('2026-10-12T04:00:00Z')
    expect(merged[0]?.end).toBe('2026-10-12T10:00:00Z')
    expect(merged[1]?.start).toBe('2026-10-13T04:00:00Z')
  })

  it('не выдаёт интервалы за пределами запроса', () => {
    const intervals = windowIntervals(ALL_DAY, '2026-10-12T06:00:00Z', '2026-10-12T08:00:00Z', TASHKENT)

    expect(intervals).toEqual([{ start: '2026-10-12T06:00:00Z', end: '2026-10-12T08:00:00Z' }])
  })

  it('переживает перевод стрелки: граница окна остаётся на 09:00 местного времени', () => {
    // 2026-03-29 в Берлине: часы переводят с 02:00 на 03:00.
    const window: ScheduleWindowInput = { daysOfWeek: EVERY_DAY, startMinute: 9 * 60, endMinute: 10 * 60 }

    const intervals = windowIntervals(window, '2026-03-28T00:00:00Z', '2026-04-01T00:00:00Z', BERLIN)

    expect(intervals).toHaveLength(4)

    // До перевода: UTC+1, 09:00 местных = 08:00Z.
    expect(intervals[0]?.start).toBe('2026-03-28T08:00:00Z')
    // В день перевода: UTC+2, 09:00 местных = 07:00Z.
    expect(intervals[1]?.start).toBe('2026-03-29T07:00:00Z')
    expect(intervals[1]?.end).toBe('2026-03-29T08:00:00Z')
    // После перевода: снова UTC+2.
    expect(intervals[2]?.start).toBe('2026-03-30T07:00:00Z')
  })
})

describe('даты кампании', () => {
  it('день окончания входит целиком', () => {
    const range = campaignRange({ startsOn: '2026-10-01', endsOn: '2026-10-15' }, TASHKENT)

    expect(range.start).toBe('2026-09-30T19:00:00Z')
    // Полночь 15-го включительно: конец — полночь 16-го по местному времени.
    expect(range.end).toBe('2026-10-15T19:00:00Z')
  })

  it('открытая дата не ограничена сверху', () => {
    const range = campaignRange({ startsOn: '2026-10-01', endsOn: null }, TASHKENT)

    expect(range.start).toBe('2026-09-30T19:00:00Z')
    expect(range.end > range.start).toBe(true)
  })

  it('граница считается в зоне источника, а не в UTC', () => {
    const a = campaignRange({ startsOn: '2026-10-01', endsOn: '2026-10-01' }, TASHKENT)
    const b = campaignRange({ startsOn: '2026-10-01', endsOn: '2026-10-01' }, BERLIN)

    // Полночь 1 октября в Ташкенте на 5 часов раньше, чем в Берлине.
    expect(a.start).toBe('2026-09-30T19:00:00Z')
    expect(b.start).toBe('2026-09-30T22:00:00Z')
  })
})

describe('разрешение конфликтов', () => {
  it('приоритет кампании важнее всего остального', () => {
    const higher = campaign({ id: 'hi', priority: 10, targets: [{ scopeType: 'company', scopeId: 'cmp_org' }] })
    const lower = campaign({ id: 'lo', priority: 1, targets: [{ scopeType: 'screen', scopeId: 'scr_main' }] })

    const result = resolveSchedule([lower, higher], screen(), TASHKENT, '2026-10-12T06:00:00Z', null)

    expect(result.campaignId).toBe('hi')
  })

  it('при равенстве приоритета побеждает более узкая область', () => {
    const byScreen = campaign({ id: 'scr', priority: 5, targets: [{ scopeType: 'screen', scopeId: 'scr_main' }] })
    const byBranch = campaign({ id: 'brn', priority: 5, targets: [{ scopeType: 'branch', scopeId: 'brn_main' }] })

    const result = resolveSchedule([byBranch, byScreen], screen(), TASHKENT, '2026-10-12T06:00:00Z', null)

    expect(result.campaignId).toBe('scr')
    expect(result.chain.map((candidate) => candidate.campaignId)).toEqual(['scr', 'brn'])
  })

  it('назначение на другой экран не влияет на текущий', () => {
    const foreign = campaign({ id: 'foreign', priority: 100, targets: [{ scopeType: 'screen', scopeId: 'scr_other' }] })
    const normal = campaign({ id: 'normal', priority: 1 })

    const result = resolveSchedule([foreign, normal], screen(), TASHKENT, '2026-10-12T06:00:00Z', null)

    expect(result.campaignId).toBe('normal')
    expect(result.chain.map((candidate) => candidate.campaignId)).toEqual(['normal'])
  })

  it('при полном равенстве побеждает более свежая кампания', () => {
    const older = campaign({ id: 'old', startsOn: '2026-10-01' })
    const newer = campaign({ id: 'new', startsOn: '2026-10-05' })

    const result = resolveSchedule([older, newer], screen(), TASHKENT, '2026-10-12T06:00:00Z', null)

    expect(result.campaignId).toBe('new')
  })

  it('идентификатор — последний тай-брейкер, и порядок входа не влияет', () => {
    const a = campaign({ id: 'a', name: 'A' })
    const b = campaign({ id: 'b', name: 'B' })

    const run1 = resolveSchedule([a, b], screen(), TASHKENT, '2026-10-12T06:00:00Z', null)
    const run2 = resolveSchedule([b, a], screen(), TASHKENT, '2026-10-12T06:00:00Z', null)

    expect(run1.campaignId).toBe('a')
    expect(run2.campaignId).toBe('a')
    expect(run1.chain.map((c) => c.campaignId)).toEqual(['a', 'b'])
    expect(run2.chain.map((c) => c.campaignId)).toEqual(['a', 'b'])
  })

  it('показывает fallback, когда кандидатов нет', () => {
    const result = resolveSchedule([], screen(), TASHKENT, '2026-10-12T06:00:00Z', 'pvr_fallback')

    expect(result.campaignId).toBeNull()
    expect(result.playlistVersionId).toBe('pvr_fallback')
    expect(result.chain).toEqual([])
  })

  it('вне окна показывается fallback', () => {
    const working = campaign({ windows: [WORKING_HOURS] })

    const inside = resolveSchedule([working], screen(), TASHKENT, '2026-10-12T06:00:00Z', 'pvr_default')
    const outside = resolveSchedule([working], screen(), TASHKENT, '2026-10-12T15:00:00Z', 'pvr_default')

    expect(inside.playlistVersionId).toBe('pvr_a')
    expect(outside.campaignId).toBeNull()
    expect(outside.playlistVersionId).toBe('pvr_default')
  })

  it('вне дат показывается fallback', () => {
    const limited = campaign({ startsOn: '2026-10-01', endsOn: '2026-10-10' })

    expect(isCampaignActiveAt(limited, screen(), TASHKENT, '2026-10-09T06:00:00Z')).toBe(true)
    expect(isCampaignActiveAt(limited, screen(), TASHKENT, '2026-10-11T06:00:00Z')).toBe(false)
  })

  it('кампания без плейлиста отдаёт fallback, но остаётся в цепочке', () => {
    const empty = campaign({ playlistVersionId: null, fallbackPlaylistVersionId: 'pvr_its_own' })

    const result = resolveSchedule([empty], screen(), TASHKENT, '2026-10-12T06:00:00Z', 'pvr_default')

    expect(result.campaignId).toBe('cmp_a')
    expect(result.playlistVersionId).toBe('pvr_its_own')
  })

  it('результат воспроизводим при повторном расчёте с тем же входом', () => {
    const campaigns = [
      campaign({ id: 'a', priority: 5, windows: [WORKING_HOURS] }),
      campaign({ id: 'b', priority: 5, targets: [{ scopeType: 'branch', scopeId: 'brn_1' }] }),
      campaign({ id: 'c', priority: 3, windows: [{ daysOfWeek: WEEKEND, startMinute: 0, endMinute: 1439 }] }),
    ]

    const at = '2026-10-12T06:00:00Z'
    const runs = Array.from({ length: 5 }, () =>
      JSON.stringify(resolveSchedule(campaigns, screen(), TASHKENT, at, 'pvr_default')),
    )

    expect(new Set(runs).size).toBe(1)
  })
})

describe('таймлайн и следующая смена', () => {
  it('разбивает неделю на сегменты по рабочим дням', () => {
    const working = campaign({ windows: [WORKING_HOURS] })

    const timeline = buildTimeline(
      [working],
      screen(),
      TASHKENT,
      '2026-10-12T00:00:00Z',
      '2026-10-19T00:00:00Z',
      'pvr_default',
    )

    // Пн–Пт внутри окна, ночи и выходные — fallback.
    expect(timeline.length).toBeGreaterThan(2)

    const campaignSegments = timeline.filter((segment) => segment.campaignId !== null)
    expect(campaignSegments.length).toBe(5)
  })

  it('сообщает момент следующей смены', () => {
    const working = campaign({ windows: [WORKING_HOURS] })

    // Понедельник 10:00 по Ташкенту: следующая смена — 18:00 того же дня.
    const next = nextChangeAt([working], screen(), TASHKENT, '2026-10-12T05:00:00Z', 2, 60_000)

    expect(next).toBe('2026-10-12T13:00:00Z')
  })

  it('не выдумывает смену, если её не будет', () => {
    const always = campaign({ windows: [ALL_DAY] })

    expect(nextChangeAt([always], screen(), TASHKENT, '2026-10-12T05:00:00Z', 7, 60_000)).toBeNull()
  })

  it('одинаковый плейлист у двух кампаний не считается сменой', () => {
    const first = campaign({ id: 'a', playlistVersionId: 'pvr_same' })
    const second = campaign({
      id: 'b',
      playlistVersionId: 'pvr_same',
      startsOn: '2026-10-13',
      windows: [WORKING_HOURS],
    })

    const next = nextChangeAt([first, second], screen(), TASHKENT, '2026-10-12T05:00:00Z', 2, 60_000)

    expect(next).toBeNull()
  })
})

describe('интервалы для календаря', () => {
  it('даёт интервалы кампании внутри её дат', () => {
    const limited = campaign({ startsOn: '2026-10-13', endsOn: '2026-10-14', windows: [WORKING_HOURS] })

    const intervals = campaignIntervals(limited, TASHKENT, '2026-10-12T00:00:00Z', '2026-10-20T00:00:00Z')

    expect(intervals).toHaveLength(2)
    expect(intervals[0]?.start).toBe('2026-10-13T04:00:00Z')
    expect(intervals[0]?.end).toBe('2026-10-13T13:00:00Z')
    expect(intervals[1]?.start).toBe('2026-10-14T04:00:00Z')
    expect(intervals[1]?.end).toBe('2026-10-14T13:00:00Z')
  })

  it('не выходит за пределы запроса', () => {
    const intervals = campaignIntervals(campaign({ windows: [WORKING_HOURS] }), TASHKENT, '2026-10-12T06:00:00Z', '2026-10-12T08:00:00Z')

    expect(intervals).toEqual([{ start: '2026-10-12T06:00:00Z', end: '2026-10-12T08:00:00Z' }])
  })

  it('кампания без окон идёт непрерывно в свои даты', () => {
    const always = campaign({ startsOn: '2026-10-13', endsOn: '2026-10-14', windows: [] })

    const intervals = campaignIntervals(always, TASHKENT, '2026-10-12T00:00:00Z', '2026-10-20T00:00:00Z')

    expect(intervals).toEqual([{ start: '2026-10-12T19:00:00Z', end: '2026-10-14T19:00:00Z' }])
  })
})
