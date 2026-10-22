/** Момент события в карточке экрана: «21.10, 14:05». */
export function formatMoment(value: string | null): string {
  if (!value) return '—'

  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

/** Число с единицей или прочерк, если плеер не смог измерить. */
export function formatNumber(value: number | null, suffix = ''): string {
  return value === null || value === undefined ? '—' : `${value}${suffix}`
}

/** Скорость канала в мегабитах: в телеметрии она приходит в Кбит/с. */
export function formatDownlink(kbps: number | null | undefined): string {
  return kbps === null || kbps === undefined ? '—' : `${(kbps / 1000).toFixed(1)} Мбит/с`
}
