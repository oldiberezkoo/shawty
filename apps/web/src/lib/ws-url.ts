/**
 * Адрес WebSocket-сервера устройств.
 *
 * Браузер ходит в API напрямую: Next не умеет проксировать WebSocket через
 * rewrite. В dev API живёт на :4000, в продакшене адрес задаётся
 * `NEXT_PUBLIC_WS_URL`.
 */
export function deviceSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL
  if (configured) return configured.replace(/\/+$/, '')

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.hostname}:4000/ws/device`
}
