type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function currentLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level
  return LEVELS[configured] ?? LEVELS.info
}

function emit(level: Level, payload: Record<string, unknown>, message: string): void {
  if (LEVELS[level] < currentLevel()) return

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...payload,
  })

  if (level === 'error' || level === 'warn') {
    console.error(line)
  } else {
    console.log(line)
  }
}

export const logger = {
  debug: (payload: Record<string, unknown>, message: string) => emit('debug', payload, message),
  info: (payload: Record<string, unknown>, message: string) => emit('info', payload, message),
  warn: (payload: Record<string, unknown>, message: string) => emit('warn', payload, message),
  error: (payload: Record<string, unknown>, message: string) => emit('error', payload, message),
}

/** Значения, которые нельзя писать в лог целиком. */
export const REDACTED = '[скрыто]'

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-device-token', 'x-csrf-token'])

/** Заголовки запроса для лога: чувствительные заменяются, чтобы токены не утекли. */
export function safeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value.slice(0, 200)
  })
  return out
}
