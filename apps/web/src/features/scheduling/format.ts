/** Человекочитаемая зона: оператор видит свои часы, а не UTC. */
export function zoneLabel(timezone: string, source: string): string {
  const origin =
    source === 'branch' ? 'зона филиала' : source === 'screen' ? 'зона экрана' : source === 'company' ? 'зона компании' : 'UTC по умолчанию'
  return `${timezone} · ${origin}`
}

export function formatTime(value: string | null, timezone: string): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDay(value: string, timezone: string): string {
  return new Date(value).toLocaleString('ru-RU', { timeZone: timezone, weekday: 'short', day: '2-digit', month: '2-digit' })
}
