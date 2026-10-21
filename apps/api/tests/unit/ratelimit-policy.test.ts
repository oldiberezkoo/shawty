import { describe, expect, it } from 'vitest'
import { checkRateLimit, normalizeIp, type WindowState } from '@/domain/ratelimit/policy'

const RULE = { limit: 5, windowMs: 10 * 60_000 }
const T0 = 1_760_000_000_000

describe('окно ограничения частоты', () => {
  it('первый запрос всегда проходит', () => {
    const result = checkRateLimit(undefined, RULE, T0)
    expect(result.allowed).toBe(true)
    expect(result.next.count).toBe(1)
  })

  it('разрешает ровно limit запросов в окне', () => {
    let state: WindowState | undefined
    const allowed: boolean[] = []
    for (let i = 0; i < 7; i += 1) {
      const result = checkRateLimit(state, RULE, T0 + i * 1000)
      state = result.next
      allowed.push(result.allowed)
    }
    expect(allowed).toEqual([true, true, true, true, true, false, false])
  })

  it('после блокировки счётчик не растёт', () => {
    const blocked = checkRateLimit({ windowStart: T0, count: 5 }, RULE, T0 + 1000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.next.count).toBe(5)
  })

  it('сообщает время ожидания до конца окна', () => {
    const result = checkRateLimit({ windowStart: T0, count: 5 }, RULE, T0 + 4 * 60_000)
    expect(result.retryAfterMs).toBe(6 * 60_000)
  })

  it('окно сбрасывается по истечении срока, а не по календарной границе', () => {
    const state: WindowState = { windowStart: T0, count: 5 }
    const afterWindow = checkRateLimit(state, RULE, T0 + RULE.windowMs)
    expect(afterWindow.allowed).toBe(true)
    expect(afterWindow.next).toEqual({ windowStart: T0 + RULE.windowMs, count: 1 })
  })

  it('остаток уменьшается и не уходит в минус', () => {
    const first = checkRateLimit(undefined, RULE, T0)
    expect(first.remaining).toBe(4)
    const second = checkRateLimit(first.next, RULE, T0 + 10)
    expect(second.remaining).toBe(3)
    const blocked = checkRateLimit({ windowStart: T0, count: 5 }, RULE, T0)
    expect(blocked.remaining).toBe(0)
  })
})

describe('нормализация адреса', () => {
  it('оставляет IPv4 как есть', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7')
  })

  it('схлопывает IPv6 до префикса /64', () => {
    // Иначе клиент с адресом из подсети исчерпает лимит для всех.
    expect(normalizeIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe(
      '2001:db8:85a3:8d3::/64',
    )
    expect(normalizeIp('2001:db8:85a3:8d3::1')).toBe(normalizeIp('2001:db8:85a3:8d3::2'))
  })

  it('переживает отсутствие адреса', () => {
    expect(normalizeIp(null)).toBe('unknown')
    expect(normalizeIp(undefined)).toBe('unknown')
    expect(normalizeIp('')).toBe('unknown')
  })
})
