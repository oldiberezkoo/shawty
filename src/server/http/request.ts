import { HttpError, isHttpError } from './errors'
import { logger } from '@/lib/logger'

export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init?.headers,
    },
  })
}

/**
 * Единый формат ошибки для API.
 *
 * Клиенту отдаётся код и безопасное сообщение. Внутренняя причина идёт в лог:
 * тексты исключений могут содержать имена таблиц, пути и SQL.
 */
export function toErrorResponse(error: unknown): Response {
  if (isHttpError(error)) {
    if (error.status >= 500) {
      logger.error({ err: error }, 'внутренняя ошибка API')
    }

    const headers: Record<string, string> = {}
    if (error.status === 429) {
      const retryAfterMs = Number(error.details?.retryAfterMs ?? 0)
      if (retryAfterMs > 0) {
        headers['retry-after'] = String(Math.ceil(retryAfterMs / 1000))
      }
    }

    return jsonResponse(
      { error: { code: error.code, message: error.message, ...(error.details ?? {}) } },
      { status: error.status, headers },
    )
  }

  logger.error({ err: error }, 'необработанная ошибка в обработчике запроса')
  return jsonResponse(
    { error: { code: 'internal', message: 'Внутренняя ошибка сервера' } },
    { status: 500 },
  )
}

type Handler = (request: Request, context?: unknown) => Promise<Response> | Response

/** Обёртка обработчика: превращает HttpError и случайные сбои в корректный JSON. */
export function route(handler: Handler): Handler {
  return async (request, context) => {
    try {
      return await handler(request, context)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  const raw = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip')
  return raw && raw.length > 0 ? raw : null
}

export function clientUserAgent(request: Request): string | null {
  return request.headers.get('user-agent')
}

/** Разбирает JSON-тело, не позволяя неограниченному телу съесть память процесса. */
export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > maxBytes) {
    throw HttpError.badRequest('payload_too_large', 'Слишком большой запрос')
  }

  const text = await request.text()
  if (text.length > maxBytes) {
    throw HttpError.badRequest('payload_too_large', 'Слишком большой запрос')
  }

  if (text.length === 0) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw HttpError.badRequest('invalid_json', 'Некорректный JSON')
  }
}
