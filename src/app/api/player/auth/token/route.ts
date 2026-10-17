import { z } from 'zod'
import { route, clientIp, readJsonBody, jsonResponse } from '@/server/http/request'
import { issueAccessToken } from '@/server/services/device-service'
import { enforceRateLimit, ipKey } from '@/server/http/rate-limit'
import { HttpError } from '@/server/http/errors'

const tokenSchema = z.object({
  deviceId: z.string().min(8).max(64),
  deviceSecret: z.string().min(32).max(128),
})

/**
 * Обмен постоянного секрета устройства на короткоживущий токен доступа.
 *
 * Постоянный секрет ходит по сети только здесь и только один раз за цикл
 * ротации. Все остальные запросы плеера авторизуются коротким токеном,
 * который нельзя случайно утечь в историю браузера или в лог.
 */
export const POST = route(async (request) => {
  enforceRateLimit(
    ipKey('device:token', request),
    { limit: 20, windowMs: 15 * 60_000 },
    'Слишком много попыток обмена токена.',
  )

  const body = tokenSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Некорректные учётные данные устройства')
  }

  const result = issueAccessToken(body.data.deviceId, body.data.deviceSecret)

  return jsonResponse({
    accessToken: result.accessToken,
    expiresAt: result.expiresAt.toISOString(),
    screenId: result.identity.screenId,
    companyId: result.identity.companyId,
  })
})
