import { CSRF_COOKIE } from '@/lib/cookie-names'

/**
 * CSRF-токен из cookie для клиентских запросов к панели.
 *
 * Токен выдаётся сервером вместе с сессией и обязан ехать в заголовке
 * `x-csrf-token` у каждого изменяющего запроса. Чтение вынесено сюда, чтобы
 * форма, доска и диалог не заводили собственные копии разбора cookie.
 */
export function readCsrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}
