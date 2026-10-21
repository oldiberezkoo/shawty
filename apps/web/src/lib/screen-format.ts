/** Форматирование идентификатора устройства для карточки экрана. */
export function formatDeviceId(deviceId: string): string {
  const body = deviceId.startsWith('scr_') ? deviceId.slice(4) : deviceId
  return `scr_${body.replace(/(.{6})(?=.)/g, '$1-')}`
}

/**
 * Человеческое имя платформы по User-Agent.
 *
 * Плеер на телевизоре присылает UA в телеметрии; оператору нужно слово
 * «Tizen» или «webOS», а не строка браузера целиком.
 */
export function describePlatform(userAgent: string | null): string | null {
  if (!userAgent) return null

  const ua = userAgent.toLowerCase()

  if (ua.includes('tizen')) return 'Tizen'
  if (ua.includes('web0s') || ua.includes('webos') || ua.includes('netcast')) return 'webOS'
  if (ua.includes('android tv') || ua.includes('googletv') || ua.includes('google tv')) return 'Android TV'
  if (ua.includes('android')) return 'Android'
  if (ua.includes('cros')) return 'ChromeOS'
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS'
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macOS'
  if (ua.includes('windows')) return 'Windows'
  if (ua.includes('linux')) return 'Linux'

  return null
}
