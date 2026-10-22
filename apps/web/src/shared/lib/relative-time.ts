function describeSecondsAgo(seconds: number): string {
  if (seconds < 60) return `${seconds} сек назад`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`

  return `${Math.floor(hours / 24)} дн назад`
}

/**
 * Давность события, если сервер уже посчитал её в секундах.
 *
 * Пустое значение означает «события ещё не было»; текст для этого случая
 * задаёт вызывающий экран — «ни разу» у экрана и «ещё ни разу» на обзоре.
 */
export function formatSecondsAgo(seconds: number | null, emptyLabel = 'ни разу'): string {
  if (seconds === null) return emptyLabel
  return describeSecondsAgo(seconds)
}

/** Давность события по его ISO-моменту. */
export function formatInstantAgo(value: string | null, emptyLabel = '—'): string {
  if (!value) return emptyLabel

  return describeSecondsAgo(Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)))
}
