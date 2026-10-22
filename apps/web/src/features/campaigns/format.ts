import type { CampaignWindowView } from './model'

/** Дни недели в порядке ISO. Бит 0 — понедельник. */
export const WEEKDAYS = [
  { bit: 1 << 0, short: 'Пн' },
  { bit: 1 << 1, short: 'Вт' },
  { bit: 1 << 2, short: 'Ср' },
  { bit: 1 << 3, short: 'Чт' },
  { bit: 1 << 4, short: 'Пт' },
  { bit: 1 << 5, short: 'Сб' },
  { bit: 1 << 6, short: 'Вс' },
]

export const STATUS_LABEL: Record<string, string> = {
  draft: 'черновик',
  in_review: 'на согласовании',
  approved: 'согласована',
  scheduled: 'запланирована',
  active: 'идёт',
  ended: 'завершена',
  archived: 'в архиве',
}

export const STATUS_TONE: Record<string, string> = {
  in_review: 'text-warn',
  approved: 'text-info',
  active: 'text-success',
  ended: 'text-text-subtle',
  draft: 'text-text-muted',
}

export function minutesToTime(minutes: number): string {
  const effective = minutes === 1439 ? 1440 : minutes
  const hours = Math.floor(effective / 60) % 24
  const mins = effective % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  const total = (hours || 0) * 60 + (minutes || 0)
  return total >= 1440 ? 1439 : total
}

/** Время из ISO в локальном поясе оператора, формат ЧЧ:ММ. */
export function isoTime(value: string | null): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Дата и время для карточки кампании. Без времени показываем только дату. */
export function periodLabel(date: string, instant: string | null): string {
  return instant ? `${date} ${isoTime(instant)}` : date
}

/** Локальные дата и время → абсолютный ISO. */
export function localInstant(date: string, time: string): string | null {
  if (!date || !time) return null

  const parsed = new Date(`${date}T${time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function windowLabel(window: CampaignWindowView): string {
  const days =
    window.daysOfWeek === 127
      ? 'ежедневно'
      : WEEKDAYS.filter((day) => (window.daysOfWeek & day.bit) !== 0)
          .map((day) => day.short)
          .join(' ') || 'нет дней'

  const end = minutesToTime(window.endMinute)

  // Окно, заданное «23:59», в интерфейсе честнее показать как «до 24:00»:
  // иначе оператор будет гадать, что показывается последнюю минуту суток.
  return `${days}, ${minutesToTime(window.startMinute)}–${end === '24:00' ? '24:00' : end}`
}
