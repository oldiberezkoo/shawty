import { z } from 'zod'
import { route, clientIp, readJsonBody, jsonResponse } from '@/server/http/request'
import { startPairingSession } from '@/server/services/pairing-service'
import { HttpError } from '@/server/http/errors'

const startSchema = z.object({
  /**
   * Локально сгенерированный телевизором nonce, 256 бит.
   * Он никогда не показывается пользователю и нужен, чтобы при обмене
   * доказать: сессию открыл именно этот телевизор, а не тот, кто посмотрел QR.
   */
  deviceNonce: z.string().min(32).max(256),
})

/**
 * Шаг 1: телевизор открывает сессию привязки.
 *
 * Аутентификации здесь нет и быть не может — устройство ещё не привязано.
 * Защита здесь и в самом сервисе: ограничение частоты по адресу и потолок
 * числа незакрытых сессий.
 */
export const POST = route(async (request) => {
  const body = startSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Ожидается локальный nonce телевизора')
  }

  const result = startPairingSession({
    ip: clientIp(request),
    request,
    deviceNonce: body.data.deviceNonce,
  })

  return jsonResponse(result)
})
