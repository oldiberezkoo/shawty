/**
 * Имена кук вынесены отдельно от серверного модуля с `next/headers`:
 * клиентский компонент должен знать имя CSRF-куки и не может импортировать
 * серверный код.
 */
export const SESSION_COOKIE = 'shawty_session'
export const CSRF_COOKIE = 'shawty_csrf'
