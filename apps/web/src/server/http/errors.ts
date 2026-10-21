/** Ошибки, которые безопасно показывать клиенту. Внутренние подробности — в лог. */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  /** Дополнительные подробности для интерфейса: какое поле подсветить и т.п. */
  readonly details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>): HttpError {
    return new HttpError(400, code, message, details)
  }

  static unauthorized(message = 'Требуется вход'): HttpError {
    return new HttpError(401, 'unauthorized', message)
  }

  static forbidden(message = 'Недостаточно прав'): HttpError {
    return new HttpError(403, 'forbidden', message)
  }

  static notFound(message = 'Не найдено'): HttpError {
    return new HttpError(404, 'not_found', message)
  }

  /** Конфликт состояния: гонка, повторное подтверждение, исчерпанный лимит. */
  static conflict(code: string, message: string, details?: Record<string, unknown>): HttpError {
    return new HttpError(409, code, message, details)
  }

  /**
   * Ресурс был и исчез по времени: истёкшее приглашение, отозванный ключ.
   *
   * Отдельный код, потому что действие разное: 404 означает «проверьте адрес,
   * возможно опечатка», а 410 — «это было, но теперь недоступно, нужно новое».
   * Приглашение, на которое отвечают 404, посчитают битым и перестанут искать.
   */
  static gone(code: string, message: string, details?: Record<string, unknown>): HttpError {
    return new HttpError(410, code, message, details)
  }

  static tooManyRequests(message: string, retryAfterMs: number): HttpError {
    return new HttpError(429, 'rate_limited', message, { retryAfterMs })
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError
}
