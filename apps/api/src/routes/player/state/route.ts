import { route, jsonResponse } from '@/server/http/request'
import { authenticateAccessToken } from '@/server/services/device-service'
import { stateForScreen } from '@/server/services/release-service'
import { HttpError } from '@/server/http/errors'

/**
 * Состояние публикации для устройства.
 *
 * Это то, что запрашивает телевизор после перезагрузки страницы или
 * потерянного канала. Ответ самодостаточен: манифест содержит всё, что
 * нужно для показа, поэтому экран не зависит от доступности панели.
 *
 * Ровно тот же ответ отдаётся и когда сеть пропала, если манифест был
 * получен ранее: кеш последней валидной публикации лежит в браузере.
 */
export const GET = route(async (request) => {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

  if (!token) {
    throw HttpError.unauthorized('Требуется токен устройства')
  }

  const identity = authenticateAccessToken(token)
  const state = stateForScreen(identity.companyId, identity.screenId)

  // Контент отдаётся с запретом кеширования: версия и файл могли смениться,
  // а застрявший манифест показывал бы прошлую акцию.
  return jsonResponse(
    {
      screenId: identity.screenId,
      ...state,
      heartbeatSec: 30,
      pollAfterMs: state.manifest ? 60_000 : 15_000,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
})
