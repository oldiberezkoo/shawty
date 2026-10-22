import { readCsrfToken } from '@/shared/lib/csrf'

export type DashboardResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }

/**
 * Запрос к API панели с общими заголовками.
 *
 * Каждая доска панели шлёт `x-company-id`, а изменяющие запросы — ещё и
 * `x-csrf-token`. Раньше эти заголовки и разбор ошибки копировались в каждом
 * компоненте; расхождение в одном месте означало бы запрос без компании или
 * без защиты от подделки.
 *
 * `init.body` передаётся как есть: вызывающий сам решает, JSON это или форма.
 */
export async function dashboardRequest<T = Record<string, unknown>>(
  path: string,
  init: RequestInit,
  companyId?: string | null,
  fallbackMessage = 'Не удалось выполнить действие',
): Promise<DashboardResult<T>> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (companyId) headers.set('x-company-id', companyId)
  if (init.body !== undefined && init.body !== null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', readCsrfToken())

  let response: Response

  try {
    response = await fetch(path, { ...init, method, headers })
  } catch {
    // Сеть недоступна: это такое же сообщение для оператора, как отказ
    // сервера, но без статуса. Молчать и оставлять кнопку занятой нельзя.
    return { ok: false, status: 0, message: 'Сервер недоступен' }
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | T
    | null

  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | null)?.error?.message

    return {
      ok: false,
      status: response.status,
      message: message ?? fallbackMessage,
    }
  }

  return { ok: true, data: payload as T }
}
