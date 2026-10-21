import { z } from 'zod'
import { route, readJsonBody, jsonResponse } from '@/server/http/request'
import { exchangeEnrollment } from '@/server/services/pairing-service'
import { HttpError } from '@/server/http/errors'

const exchangeSchema = z.object({
  sessionId: z.string().min(16).max(64),
  /**
   * Локальный nonce телевизора — доказательство, что сессию открыл именно он.
   * Идентификатора сессии из QR недостаточно: его видит любой, кто посмотрел
   * на экран во время подтверждения.
   */
  deviceNonce: z.string().min(32).max(256),
})

/**
 * Шаг 4: телевизор получает собственные постоянные учётные данные.
 *
 * Ответ содержит единственный раз в жизни секрет устройства. В базе он
 * больше не появится — там остаётся только HMAC.
 */
export const POST = route(async (request) => {
  const body = exchangeSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Некорректные данные привязки')
  }

  const result = exchangeEnrollment(body.data)

  return jsonResponse(
    {
      ...result,
      // Явно предупреждаем телевизор: потеря этих данных означает повторную привязку.
      storage: 'indexeddb',
      reauthRequiredAfterClear: true,
    },
    { status: 200 },
  )
})
