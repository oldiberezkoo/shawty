import { route, jsonResponse } from '@/server/http/request'
import { authenticateAccessToken } from '@/server/services/device-service'
import { revisionForScreen } from '@/server/services/release-service'
import { HttpError } from '@/server/http/errors'

/**
 * Отметка состояния экрана.
 *
 * Дополняет канал устройств: даже если публикация не дошла по сокету, экран
 * замечает изменение этой отметки и забирает свежий манифест. Ответ маленький
 * и без ссылок на файлы, поэтому опрашивать его можно часто — в отличие от
 * полного `/api/player/state`.
 */
export const GET = route(async (request) => {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

  if (!token) {
    throw HttpError.unauthorized('Требуется токен устройства')
  }

  const identity = authenticateAccessToken(token)
  const revision = revisionForScreen(identity.companyId, identity.screenId)

  return jsonResponse(
    { screenId: identity.screenId, ...revision },
    { headers: { 'cache-control': 'no-store' } },
  )
})
