/**
 * Окна показа и их развёртка во времени.
 *
 * Окно — это правило «по каким дням и в какие часы показывать», заданное в
 * локальном времени филиала: битовая маска дней недели и минуты от полуночи.
 * Оно не хранит даты: даты живут в кампании (`starts_on` / `ends_on`).
 *
 * Здесь окно превращается в конкретные интервалы времени. Это единственное
 * место, где «09:00 по ташкентскому времени» становиется инстантом, — и
 * поэтому место, где важно не ошибиться с переводом стрелки.
 */
import { Temporal } from '@js-temporal/polyfill'

import {
  addCalendarDays,
  instantOfLocal,
  localDateParts,
  localDateString,
  localMidnight,
  toInstant,
  type InstantLike,
} from './timezone'

/** Окно показа в том виде, в котором оно лежит в базе. */
export type ScheduleWindowInput = {
  /** Битовая маска: бит 0 — понедельник … бит 6 — воскресенье. 127 — ежедневно. */
  daysOfWeek: number
  /** Минуты от полуночи включительно, 0…1439. */
  startMinute: number
  /**
   * Минуты от полуночи **не**включительно, 0…1440.
   *
   * Значение 1440 — полночь следующих суток, а значит «показывать целые
   * сутки». Именно поэтому граница не включительная: «до 18:00» должно
   * означать «до 18:00», а не «до 17:59».
   *
   * `endMinute <= startMinute` означает окно через полночь.
   */
  endMinute: number
}

/** Интервал показа во времени. */
export type ScheduleInterval = {
  start: string
  end: string
}

export const MINUTES_IN_DAY = 24 * 60

/** Проверка окна: маска в диапазоне, минуты в пределах суток. */
export function isValidWindow(window: ScheduleWindowInput): boolean {
  if (!Number.isInteger(window.daysOfWeek) || window.daysOfWeek < 1 || window.daysOfWeek > 127) return false
  if (!Number.isInteger(window.startMinute) || !Number.isInteger(window.endMinute)) return false
  if (window.startMinute < 0 || window.startMinute >= MINUTES_IN_DAY) return false
  if (window.endMinute < 0 || window.endMinute > MINUTES_IN_DAY) return false

  // Нулевая длина означала бы «никогда», но выглядела бы как ошибка ввода.
  // Отличать её от «показывать круглосуточно» — работа автора расписания,
  // а не системы.
  return window.startMinute !== window.endMinute
}

/** Окно переходит через полночь. */
export function crossesMidnight(window: ScheduleWindowInput): boolean {
  return window.endMinute <= window.startMinute
}

/** Показывается ли этот день недели по маске. */
export function matchesDay(daysOfWeek: number, weekday: number): boolean {
  return (daysOfWeek & (1 << (weekday - 1))) !== 0
}

/** Показывается ли этот момент. Начало включено, конец исключён. */
export function isWithinWindow(window: ScheduleWindowInput, at: InstantLike, timezone: string): boolean {
  const zoned = toInstant(at).toZonedDateTimeISO(timezone)
  const minute = zoned.hour * 60 + zoned.minute

  if (!crossesMidnight(window)) {
    return matchesDay(window.daysOfWeek, zoned.dayOfWeek) && minute >= window.startMinute && minute < window.endMinute
  }

  // Окно через полночь: 22:00–06:00. Утренняя половина относится к *вчерашнему*
  // окну, поэтому день недели берётся не от текущего момента, а от предыдущего.
  if (minute >= window.startMinute) return matchesDay(window.daysOfWeek, zoned.dayOfWeek)

  // После полуночи и до конца окна: проверяем вчерашний день.
  // Проверка `minute < endMinute` обязательна: без неё окно «22:00–06:00»
  // считалось бы открытым весь вторник с 06:00 до 22:00.
  if (minute >= window.endMinute) return false

  return matchesDay(window.daysOfWeek, zoned.subtract({ days: 1 }).dayOfWeek)
}

/**
 * Все интервалы окна в заданном диапазоне.
 *
 * Диапазон расширяется на сутки в обе стороны: окно, начавшееся вчера в 22:00,
 * продолжается сегодня до 06:00, и без расширения его второй половиной
 * пожертвовали бы молча.
 *
 * Шаг — сутки, а не час: перечислять часы было бы тысячи интервалов ради
 * двух-трёх нужных, а сутки совпадают с единицей, в которой задано окно.
 */
export function windowIntervals(
  window: ScheduleWindowInput,
  from: InstantLike,
  to: InstantLike,
  timezone: string,
): ScheduleInterval[] {
  const start = toInstant(from)
  const end = toInstant(to)

  if (Temporal.Instant.compare(end, start) <= 0) return []

  const intervals: ScheduleInterval[] = []

  // Локальная дата начала минус один день: сутки целиком, чтобы не пропустить
  // окно, начавшееся накануне.
  let date = addCalendarDays(localMidnight(localDateString(start, timezone), timezone), -1, timezone)
  const lastDate = localMidnight(localDateString(end, timezone), timezone)

  while (Temporal.Instant.compare(date, lastDate) <= 0) {
    const { weekday, year, month, day } = localDateParts(date, timezone)

    if (matchesDay(window.daysOfWeek, weekday)) {
      const { startMinute, endMinute } = window

      // Начало всегда в текущие сутки: день недели проверялся именно для них,
      // и для окна через полночь это день *начала*, а не день конца.
      const dayStart = localMidnight(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, timezone)

      const segmentStart = instantOfLocal(
        { year, month, day, hour: Math.floor(startMinute / 60), minute: startMinute % 60 },
        timezone,
      )

      // 1440 — это полночь следующих суток, а не 24:00 того же дня:
      // такого часа в календаре нет, и Temporal его справедливо не примет.
      const segmentEndCandidate =
        endMinute === MINUTES_IN_DAY
          ? addCalendarDays(dayStart, 1, timezone)
          : instantOfLocal(
              { year, month, day, hour: Math.floor(endMinute / 60), minute: endMinute % 60 },
              timezone,
            )

      const segmentEnd = crossesMidnight(window)
        ? addCalendarDays(segmentEndCandidate, 1, timezone)
        : segmentEndCandidate

      // Пересечение с запросом. Без него в таймлайн попадали бы интервалы
      // за пределами горизонта, и `nextChangeAt` уезжал бы в прошлое.
      const clippedStart = Temporal.Instant.compare(segmentStart, start) > 0 ? segmentStart : start
      const clippedEnd = Temporal.Instant.compare(segmentEnd, end) < 0 ? segmentEnd : end

      if (Temporal.Instant.compare(clippedStart, clippedEnd) < 0) {
        intervals.push({ start: clippedStart.toString(), end: clippedEnd.toString() })
      }
    }

    date = addCalendarDays(date, 1, timezone)
  }

  intervals.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

  // Склейка соседних: два окна 09:00–12:00 и 12:00–15:00 — один интервал
  // с точки зрения телевизора, а не два.
  const merged: ScheduleInterval[] = []

  for (const interval of intervals) {
    const previous = merged[merged.length - 1]

    if (previous && previous.end === interval.start) {
      previous.end = interval.end
      continue
    }

    merged.push({ ...interval })
  }

  return merged
}

/** Есть ли в диапазоне хотя бы один интервал показа. */
export function hasAnyInterval(
  window: ScheduleWindowInput,
  from: InstantLike,
  to: InstantLike,
  timezone: string,
): boolean {
  return windowIntervals(window, from, to, timezone).length > 0
}