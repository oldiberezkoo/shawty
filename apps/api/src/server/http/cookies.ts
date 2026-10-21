import { CSRF_COOKIE, SESSION_COOKIE } from '@shawty/contracts'
import { currentRequest } from '@/http/context'

export { CSRF_COOKIE, SESSION_COOKIE }

/**
 * В продакшене cookie должны быть Secure. Для локального запуска по HTTP
 * (в том числе `NODE_ENV=production` на localhost) это отключается
 * переменной COOKIE_SECURE=false.
 */
const isProduction = process.env.NODE_ENV === 'production'
const secureCookies =
  process.env.COOKIE_SECURE === 'true' ||
  (process.env.COOKIE_SECURE !== 'false' && isProduction)

type SameSite = 'lax' | 'strict' | 'none'

type CookieOptions = {
  httpOnly?: boolean
  sameSite?: SameSite
  secure?: boolean
  path?: string
  expires?: Date
  maxAge?: number
}

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }

  parts.push(`Path=${options.path ?? '/'}`)

  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite[0]?.toUpperCase()}${options.sameSite.slice(1)}`)
  }

  return parts.join('; ')
}

function parseCookies(header: string | null): Map<string, string> {
  const result = new Map<string, string>()
  if (!header) return result

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0) continue

    const name = pair.slice(0, separator).trim()
    const raw = pair.slice(separator + 1).trim()
    if (!name) continue

    try {
      result.set(name, decodeURIComponent(raw))
    } catch {
      result.set(name, raw)
    }
  }

  return result
}

/**
 * httpOnly: сессию нельзя украсть через JavaScript.
 * sameSite=lax: переход по QR-ссылке с другого устройства — это top-level
 * навигация, cookie при ней отправляется; межсайтовые POST — нет.
 */
export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
    path: '/',
    expires: expiresAt,
  }
}

/**
 * CSRF-cookie намеренно доступна JavaScript: клиент читает её и повторяет
 * значение в заголовке. Подделать заголовок cross-site запрос не может,
 * поэтому связка cookie + header отсекает CSRF.
 */
export function csrfCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: false,
    sameSite: 'lax',
    secure: secureCookies,
    path: '/',
    expires: expiresAt,
  }
}

export async function readSessionCookie(): Promise<string | undefined> {
  return parseCookies(currentRequest().request.headers.get('cookie')).get(SESSION_COOKIE)
}

export async function readCsrfCookie(): Promise<string | undefined> {
  return parseCookies(currentRequest().request.headers.get('cookie')).get(CSRF_COOKIE)
}

export async function setAuthCookies(token: string, csrfSecret: string, expiresAt: Date): Promise<void> {
  const store = currentRequest()

  store.setCookies.push(
    serializeCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt)),
    serializeCookie(CSRF_COOKIE, csrfSecret, csrfCookieOptions(expiresAt)),
  )
}

export async function clearAuthCookies(): Promise<void> {
  const store = currentRequest()
  const expired = new Date(0)

  store.setCookies.push(
    serializeCookie(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/', expires: expired, maxAge: 0 }),
    serializeCookie(CSRF_COOKIE, '', { httpOnly: false, sameSite: 'lax', secure: secureCookies, path: '/', expires: expired, maxAge: 0 }),
  )
}
