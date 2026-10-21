/**
 * Имена cookie. Общие для API и веба: веб читает CSRF-cookie из браузера,
 * API выставляет обе cookie. Значения менять нельзя без миграции сессий.
 */
export const SESSION_COOKIE = 'shawty_session'
export const CSRF_COOKIE = 'shawty_csrf'
