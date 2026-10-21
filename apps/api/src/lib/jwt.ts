import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Минимальный JWT по HS256. Собственная реализация вместо библиотеки:
 * нужен ровно один алгоритм подписи, а лишняя зависимость на телевизорном плеере
 * и в серверном бандле не окупается.
 *
 * Секрет здесь — отдельный, производный от серверного: ротация основного
 * секрета не должна отзывать все устройства разом.
 */

export type JwtPayload = {
  /** Идентификатор устройства (публичная часть). */
  sub: string
  /** Идентификатор экрана в базе. */
  screen: string
  /** Компания-владелец. */
  company: string
  /** Версия учётных данных: рост отзывает все выпущенные токены. */
  cv: number
  /** Тип токена: `device`. */
  typ: 'device'
  iat: number
  exp: number
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  ttlMs: number,
  now = Date.now(),
): { token: string; expiresAt: Date } {
  const issuedAt = Math.floor(now / 1000)
  const expiresAtSeconds = issuedAt + Math.floor(ttlMs / 1000)

  const full: JwtPayload = {
    ...payload,
    iat: issuedAt,
    exp: expiresAtSeconds,
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(full))
  const signature = sign(`${header}.${body}`, secret)

  return {
    token: `${header}.${body}.${signature}`,
    expiresAt: new Date(expiresAtSeconds * 1000),
  }
}

export type VerifyResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

export function verifyJwt(token: string, secret: string, now = Date.now()): VerifyResult {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }

  const [header, body, signature] = parts as [string, string, string]

  const expected = sign(`${header}.${body}`, secret)
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }

  let payload: JwtPayload
  try {
    payload = JSON.parse(base64UrlDecode(body)) as JwtPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof payload.exp !== 'number' || payload.typ !== 'device' || typeof payload.sub !== 'string') {
    return { ok: false, reason: 'malformed' }
  }

  if (payload.exp * 1000 <= now) return { ok: false, reason: 'expired' }

  return { ok: true, payload }
}
