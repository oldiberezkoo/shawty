import { z } from 'zod'
import { route, jsonResponse } from '@/server/http/request'
import { watchPairing } from '@/server/services/pairing-service'
import { enforceRateLimit, ipKey } from '@/server/http/rate-limit'
import { HttpError } from '@/server/http/errors'

const querySchema = z.object({
  sessionId: z.string().min(16).max(64),
})

/**
 * Шаг 2: телевизор спрашивает состояние ожидания.
 *
 * Канал без аутентификации, и это осознанно: он должен работать до того,
 * как у устройства появились учётные данные. Поэтому здесь нет ничего
 * чувствительного — только факт «ждём / подтверждено / истекло» и остаток
 * времени. Учётные данные по этому каналу не выдаются никогда.
 */
export const GET = route(async (request) => {
  enforceRateLimit(
    ipKey('pairing:status', request),
    { limit: 120, windowMs: 10 * 60_000 },
    'Слишком частые запросы состояния привязки.',
  )

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({ sessionId: url.searchParams.get('sessionId') ?? '' })

  if (!parsed.success) {
    throw HttpError.badRequest('invalid_input', 'Некорректный идентификатор сессии')
  }

  return jsonResponse(watchPairing(parsed.data.sessionId))
})
