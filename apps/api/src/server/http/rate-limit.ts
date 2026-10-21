import { eq, lt } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import { rateLimitBuckets } from '@/db/schema'
import { checkRateLimit, normalizeIp, type RateLimitRule } from '@/domain/ratelimit/policy'
import { HttpError } from './errors'

export { normalizeIp }

/**
 * Счётчики лежат в базе, а не в памяти процесса: перезапуск не должен
 * обнулять ограничение частоты, иначе перебор проходил бы «пакетными»
 * попытками по одному запросу на каждый рестарт.
 */
export function enforceRateLimit(key: string, rule: RateLimitRule, message: string): void {
  const now = Date.now()

  const decision = withImmediateTransaction((tx) => {
    const current = tx
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, key))
      .get()

    const result = checkRateLimit(
      current ? { windowStart: current.windowStart.getTime(), count: current.count } : undefined,
      rule,
      now,
    )

    if (result.next.count !== (current?.count ?? 0) || current?.windowStart.getTime() !== result.next.windowStart) {
      tx
        .insert(rateLimitBuckets)
        .values({
          key,
          windowStart: new Date(result.next.windowStart),
          count: result.next.count,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: rateLimitBuckets.key,
          set: {
            windowStart: new Date(result.next.windowStart),
            count: result.next.count,
            updatedAt: new Date(),
          },
        })
        .run()
    }

    return result
  })

  if (!decision.allowed) {
    throw HttpError.tooManyRequests(message, decision.retryAfterMs)
  }
}

/**
 * Ключ по адресу клиента. IPv6 схлопывается до /64: иначе клиент
 * с адресом из подсети выбирает себе один лимит на каждый адрес.
 */
export function ipKey(scope: string, request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const raw =
    forwarded?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  return `${scope}:${normalizeIp(raw)}`
}

export function keyOf(scope: string, id: string): string {
  return `${scope}:${id}`
}

/** Удаляет счётчики с окном старше указанного срока. Вызывается по таймеру. */
export function pruneRateLimitBuckets(olderThanMs = 48 * 60 * 60_000): number {
  const threshold = new Date(Date.now() - olderThanMs)
  return db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, threshold)).run().changes
}
