/**
 * Доступность во времени.
 *
 * Вопрос отчёта: «где и когда была недоступность». Ответ считается из
 * интервалов простоя, а не из строки в журнале: событие «экран упал в 14:03»
 * ничего не говорит о том, сколько он лежал.
 *
 * Два уровня, и их нельзя смешивать (§7.4 плана):
 *
 * - **на связи** — приходит heartbeat;
 * - **показывает нужное** — экран на связи и подтвердил применение текущей
 *   публикации. Экран может быть на связи и показывать вчерашнюю акцию.
 *
 * Уровней ровно столько же, сколько в доставке, и третий — «человек увидел» —
 * по-прежнему не утверждается: камеры и датчиков внимания нет (§9.6).
 */

/** Интервал простоя, обрезанный по запрошенному периоду. */
export type DowntimeInterval = {
  start: Date
  end: Date
}

export type AvailabilityInput = {
  from: Date
  to: Date
  /** Интервалы простоя, найденные по инцидентам. */
  downtimes: readonly DowntimeInterval[]
  /**
   * Окна, в которые экран был на связи, но не подтвердил применение публикации.
   *
   * Отдельный список, потому что «на связи со старым контентом» — это не
   * поломка: сеть в магазине жива, реклама показывается, но не та. Считать
   * это простоем было бы ложью в обе стороны — и занижает, и завышает.
   */
  staleWindows?: readonly DowntimeInterval[]
}

/** Ещё не закрытый отрезок простоя: закрывать его нечем. */
export type OpenInterval = { start: Date }

export type Availability = {
  from: Date
  to: Date
  totalMs: number
  offlineMs: number
  /** На связи, но с устаревшей публикацией. */
  staleMs: number
  /** Известно, что было недоступно. */
  uptimeMs: number
  /** Известно, что показывало именно ту публикацию, которую должно было. */
  servingMs: number
  /**
   * Процент доступности.
   *
   * `null`, когда период нулевой или целиком простоя: «0%» звучит как измерение,
   * а отсутствие данных не должно выглядеть как измерение.
   */
  uptimePercent: number | null
  /** Открытые отрезки: экран молчит прямо сейчас, закрыть их ещё нечем. */
  openDowntimes: number
}

function clip(interval: { start: Date; end?: Date | null }, from: Date, to: Date): DowntimeInterval | null {
  const start = interval.start > from ? interval.start : from
  const end = interval.end ? (interval.end < to ? interval.end : to) : to

  if (start >= end) return null

  return { start, end }
}

/** Суммарная длительность интервалов без наложений. */
export function measureDowntime(intervals: readonly DowntimeInterval[]): number {
  if (intervals.length === 0) return 0

  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime())

  let total = 0
  let currentStart = sorted[0].start.getTime()
  let currentEnd = sorted[0].end.getTime()

  for (let index = 1; index < sorted.length; index += 1) {
    const interval = sorted[index]!
    const start = interval.start.getTime()
    const end = interval.end.getTime()

    if (start > currentEnd) {
      total += currentEnd - currentStart
      currentStart = start
      currentEnd = end
      continue
    }

    if (end > currentEnd) currentEnd = end
  }

  total += currentEnd - currentStart

  return total
}

/**
 * Доступность за период.
 *
 * `staleMs` вычитается из `uptimeMs`, а не прибавляется к простою: экран был
 * на связи — доступность это не отменяет, но контент на нём был не тот.
 * Оба числа показываются рядом, и ни одно не выдаётся за другое.
 */
export function computeAvailability(input: AvailabilityInput): Availability {
  const from = input.from
  const to = input.to
  const totalMs = Math.max(0, to.getTime() - from.getTime())

  const downtimes = input.downtimes
    .map((interval) => clip(interval, from, to))
    .filter((interval): interval is DowntimeInterval => interval !== null)

  const stale = (input.staleWindows ?? [])
    .map((interval) => clip(interval, from, to))
    .filter((interval): interval is DowntimeInterval => interval !== null)

  const offlineMs = measureDowntime(downtimes)

  // Простой и «на связи, но старое» могут пересекаться во времени: экран
  // отставал и до того, как пропала сеть. Для честного счёта устаревание
  // считаем только там, где экран был жив.
  const staleMs = measureDowntime(subtract(stale, downtimes))

  const uptimeMs = Math.max(0, totalMs - offlineMs)

  return {
    from,
    to,
    totalMs,
    offlineMs,
    staleMs,
    uptimeMs,
    servingMs: Math.max(0, uptimeMs - staleMs),
    uptimePercent: totalMs > 0 ? Math.round(((uptimeMs / totalMs) * 1000)) / 10 : null,
    openDowntimes: input.downtimes.filter((interval) => !interval.end).length,
  }
}

/** Разность множеств интервалов: из `a` вычитаются пересечения с `b`. */
function subtract(a: readonly DowntimeInterval[], b: readonly DowntimeInterval[]): DowntimeInterval[] {
  if (b.length === 0) return [...a]

  const result: DowntimeInterval[] = []

  for (const interval of a) {
    let pieces: DowntimeInterval[] = [interval]

    for (const hole of b) {
      pieces = pieces.flatMap((piece) => {
        if (hole.end <= piece.start || hole.start >= piece.end) return [piece]

        const left: DowntimeInterval | null =
          hole.start > piece.start ? { start: piece.start, end: hole.start } : null
        const right: DowntimeInterval | null =
          hole.end < piece.end ? { start: hole.end, end: piece.end } : null

        return [left, right].filter((value): value is DowntimeInterval => value !== null)
      })
    }

    result.push(...pieces)
  }

  return result
}

/**
 * Простой, который ещё не закончился.
 *
 * Открытый инцидент обрезается текущим моментом: иначе его длительность
 * росла бы сама по себе, и экран, который лежит сутки, «накапливал» бы
 * недоступность быстрее реального времени.
 */
export function openDowntime(open: readonly OpenInterval[], now: Date): DowntimeInterval[] {
  return open.map((interval) => ({ start: interval.start, end: now }))
}