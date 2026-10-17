/**
 * Правила ограничения частоты. Чистые функции, чтобы границы окна
 * проверялись тестами, а не только интеграцией с хранилищем счётчиков.
 */

export type WindowState = {
  windowStart: number
  count: number
}

export type RateLimitRule = {
  limit: number
  windowMs: number
}

export type RateLimitDecision = {
  allowed: boolean
  /** Сколько миллисекунд ждать до следующей попытки. */
  retryAfterMs: number
  remaining: number
}

/** Окно «плавающее»: отсчёт начинается с первого запроса, а не с фиксированной границы. */
export function checkRateLimit(
  state: WindowState | undefined,
  rule: RateLimitRule,
  now: number,
): RateLimitDecision & { next: WindowState } {
  const fresh: WindowState = { windowStart: now, count: 0 }

  if (!state || now - state.windowStart >= rule.windowMs) {
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: rule.limit - 1,
      next: { windowStart: now, count: 1 },
    }
  }

  const elapsed = now - state.windowStart

  if (state.count >= rule.limit) {
    return {
      allowed: false,
      retryAfterMs: rule.windowMs - elapsed,
      remaining: 0,
      next: { windowStart: state.windowStart, count: state.count },
    }
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: rule.limit - (state.count + 1),
    next: { windowStart: state.windowStart, count: state.count + 1 },
  }
}

/**
 * Ключ счётчика. Адрес приводится к /64 для IPv6, иначе один клиент
 * с адресом из подсети исчерпает лимит всех остальных.
 */
export function normalizeIp(ip: string | null | undefined): string {
  if (!ip) return 'unknown'
  if (ip.includes(':')) {
    const parts = ip.split(':')
    return `${parts.slice(0, 4).join(':')}::/64`
  }
  return ip
}
