import { route, jsonResponse } from '@/server/http/request'
import { rotateDeviceSecret, authenticateAccessToken } from '@/server/services/device-service'
import { HttpError } from '@/server/http/errors'
import { logger } from '@/lib/logger'

/**
 * Ротация секрета устройства по инициативе самого телевизора.
 *
 * Обычно её запускает администратор из панели: сервер помечает ротацию как
 * отложенную, а устройство при следующем входе в канал обнаруживает
 * несовпадение версий и приходит сюда за новым секретом.
 *
 * Доступ выдаёт действующий access-токен устройства, привязанный к текущей
 * версии: поэтому старый секрет после ротации больше не работает нигде.
 */
export const POST = route(async (request) => {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

  if (!token) {
    throw HttpError.unauthorized('Требуется токен устройства')
  }

  const identity = authenticateAccessToken(token)
  const result = rotateDeviceSecret(identity)

  logger.info({ screenId: identity.screenId, version: result.version }, 'секрет устройства ротирован')

  return jsonResponse({
    ok: true,
    deviceId: identity.deviceId,
    deviceSecret: result.deviceSecret,
    credentialVersion: result.version,
    // Токен, по которому пришёл запрос, уже недействителен: версия выросла.
    reauthRequired: true,
  })
})
