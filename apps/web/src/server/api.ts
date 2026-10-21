import { cookies } from 'next/headers'
import type { ErrorPayload } from '@shawty/contracts'

const apiInternalUrl = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(path: string, companyId?: string, init?: RequestInit): Promise<Response> {
  const store = await cookies()
  const cookie = store
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join('; ')

  const headers = new Headers(init?.headers)
  if (cookie) headers.set('cookie', cookie)
  if (companyId) headers.set('x-company-id', companyId)

  return fetch(`${apiInternalUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  })
}

async function parseError(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => null)) as ErrorPayload | null

  return new ApiError(
    response.status,
    payload?.error?.code ?? 'http_error',
    payload?.error?.message ?? `API вернул ${response.status}`,
  )
}

/**
 * GET к API от имени текущей сессии.
 *
 * Cookie берутся из запроса Next и передаются в API. Для GET CSRF не нужен:
 * побочных эффектов у чтения нет.
 */
export async function apiGet<T>(path: string, companyId?: string): Promise<T> {
  const response = await request(path, companyId)

  if (!response.ok) {
    throw await parseError(response)
  }

  return (await response.json()) as T
}

/** POST/PUT/PATCH/DELETE из серверного кода веба, если понадобятся. */
export async function apiSend<T>(
  path: string,
  init: RequestInit & { companyId?: string; csrfToken?: string },
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.companyId) headers.set('x-company-id', init.companyId)
  if (init.csrfToken) headers.set('x-csrf-token', init.csrfToken)

  const response = await request(path, undefined, { ...init, headers })

  if (!response.ok) {
    throw await parseError(response)
  }

  return (await response.json()) as T
}
