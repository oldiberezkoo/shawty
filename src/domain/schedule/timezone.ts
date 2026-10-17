/**
 * Часовые пояса и локальное время расписания.
 *
 * Отдельный модуль потому, что окно показа задано в **локальном** времени
 * филиала, а хранится и сравнивается в UTC. Наивная арифметика по часовому
 * смещению здесь не работает: кампания «с 09:00 до 18:00» обязана корректно
 * пережить перевод стрелки, а зимнее и летнее смещение различаются.
 *
 * `@js-temporal/polyfill` даёт ровно то, что нужно: локальное время зоны,
 * разобранное в инстант, с учётом переводов. Полифилл выбран потому, что
 * Temporal ещё не во всех браузерах, а расписание считает сервер, но
 * таймзона из библиотеки нужна и на ТВ при проверке `nextChangeAt`.
 */
import { Temporal } from '@js-temporal/polyfill'

/** Зона по умолчанию, если ни у экрана, ни у филиала, ни у компании её нет. */
export const FALLBACK_TIMEZONE = 'UTC'

/** Момент времени в любом представлении, которое нам дают снаружи. */
export type InstantLike = Date | string | Temporal.Instant

/** Принимает только похожее на IANA имя **и** только если среда его знает. */
export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    // Зона не поддерживается средой. Лучше явный UTC с предупреждением в
    // интерфейсе, чем молчаливое смещение расписания на неизвестное число часов.
    return false
  }
}

/**
 * Часовой пояс по приоритету.
 *
 * Экран переопределяет филиал, филиал — компанию. Неизвестная зона
 * отбрасывается, а не принимается: ошибочный часовой пояс сдвигает всё
 * расписание, и обнаруживается это обычно через неделю работы сети.
 */
export function resolveTimezone(input: {
  screenOverride?: string | null
  branch?: string | null
  company?: string | null
}): { timezone: string; source: 'screen' | 'branch' | 'company' | 'fallback' } {
  if (isValidTimezone(input.screenOverride)) return { timezone: input.screenOverride, source: 'screen' }
  if (isValidTimezone(input.branch)) return { timezone: input.branch, source: 'branch' }
  if (isValidTimezone(input.company)) return { timezone: input.company, source: 'company' }

  return { timezone: FALLBACK_TIMEZONE, source: 'fallback' }
}

/** Приводит внешнее значение к `Instant`. */
export function toInstant(value: InstantLike): Temporal.Instant {
  if (value instanceof Date) return Temporal.Instant.fromEpochMilliseconds(value.getTime())
  if (typeof value === 'string') return Temporal.Instant.from(value)
  return value
}

/** Дата и время в зоне — то, что видит оператор на стенке магазина. */
export function localDateParts(value: InstantLike, timezone: string) {
  const zoned = toInstant(value).toZonedDateTimeISO(timezone)

  return {
    year: zoned.year,
    month: zoned.month,
    day: zoned.day,
    hour: zoned.hour,
    minute: zoned.minute,
    /** Понедельник = 1 … воскресенье = 7, как принято в ISO. */
    weekday: zoned.dayOfWeek,
  }
}

/**
 * Дата `YYYY-MM-DD` в зоне.
 *
 * Граница кампании «до 15 марта» — это полночь 15 марта **в Ташкенте**, а не
 * в UTC: во второй половине дня UTC-дата уже «завтра», и кампания обрывалась
 * бы на несколько часов раньше, чем оператор указал.
 */
export function localDateString(value: InstantLike, timezone: string): string {
  const { year, month, day } = localDateParts(value, timezone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Полночь указанной локальной даты как инстант. */
export function localMidnight(
  dateString: string,
  timezone: string,
  disambiguation: 'compatible' | 'earlier' | 'later' | 'reject' = 'compatible',
): Temporal.Instant {
  const [year, month, day] = dateString.split('-').map(Number) as [number, number, number]
  return instantOfLocal({ year, month, day, hour: 0, minute: 0 }, timezone, disambiguation)
}

/**
 * Локальные дата и время в инстант.
 *
 * `compatible` выбирает более ранний из двух возможных моментов в день
 * перевода стрелки. Для минутных окон показа разница в час не видна, зато
 * результат никогда не бывает «не существует».
 */
export function instantOfLocal(
  fields: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timezone: string,
  disambiguation: 'compatible' | 'earlier' | 'later' | 'reject' = 'compatible',
): Temporal.Instant {
  return Temporal.ZonedDateTime.from(
    {
      timeZone: timezone,
      year: fields.year,
      month: fields.month,
      day: fields.day,
      hour: fields.hour ?? 0,
      minute: fields.minute ?? 0,
      second: fields.second ?? 0,
    },
    { disambiguation },
  ).toInstant()
}

/** Минуты от полуночи в зоне — единица, в которой задано окно показа. */
export function localMinuteOfDay(value: InstantLike, timezone: string): number {
  const { hour, minute } = localDateParts(value, timezone)
  return hour * 60 + minute
}

/**
 * Смещение зоны в минутах на заданный момент.
 *
 * Именно «на этот момент», а не для даты: в день перевода смещение
 * меняется, и усреднённое значение сдвинуло бы границу окна на час.
 */
export function offsetMinutesAt(value: InstantLike, timezone: string): number {
  return toInstant(value).toZonedDateTimeISO(timezone).offset
}

/** Момент в формате, пригодном для отправки телевизору и для логов. */
export function isoInstant(value: InstantLike): string {
  return toInstant(value).toString()
}