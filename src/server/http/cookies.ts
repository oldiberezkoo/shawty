import { cookies } from 'next/headers'
import { CSRF_COOKIE, SESSION_COOKIE } from '@/lib/cookie-names'

export { CSRF_COOKIE, SESSION_COOKIE }

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Пользовательская сессия.
 *
 * httpOnly: недоступна из JavaScript, поэтому XSS её не украдёт.
 * sameSite=lax: не уходит на сторонние домены, но работает при переходе
 * по QR-ссылке с другого сайта — это вход при переходе из почты или мессенджера.
 * secure: только по HTTPS в продакшене.
 */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    expires: expiresAt,
  }
}

/**
 * CSRF-кука намеренно читаема скриптом: клиент дублирует значение
 * в заголовке, а сервер сверяет с тем, что лежит в сессии. Без возможности
 * прочитать куку злоумышленник не подставит заголовок cross-site запроса.
 */
export function csrfCookieOptions(expiresAt: Date) {
  return {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    expires: expiresAt,
  }
}

export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value
}

export async function readCsrfCookie(): Promise<string | undefined> {
  const store = await cookies()
  return store.get(CSRF_COOKIE)?.value
}

export async function setAuthCookies(token: string, csrfSecret: string, expiresAt: Date): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
  store.set(CSRF_COOKIE, csrfSecret, csrfCookieOptions(expiresAt))
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  store.delete(CSRF_COOKIE)
}
