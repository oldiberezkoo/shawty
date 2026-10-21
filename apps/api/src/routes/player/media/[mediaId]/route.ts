import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { deviceCredentials, mediaAssets } from '@/db/schema'
import { route } from '@/server/http/request'
import { authenticateAccessToken } from '@/server/services/device-service'
import { assetPaths } from '@/server/services/media-service'
import { verifyMediaTicket } from '@/domain/release/media-ticket'
import { serveFile } from '@/routes/dashboard/media/file/route'
import { HttpError } from '@/server/http/errors'
import { enforceRateLimit, keyOf } from '@/server/http/rate-limit'

/**
 * Отдача файла телевизору.
 *
 * Два допустимых способа авторизации:
 * - постоянный токен устройства в заголовке (обычный случай: плеер сам
 *   догружает файл через fetch);
 * - пропуск на конкретный файл в адресе (случай `<img>` и `<video>`: они
 *   не умеют слать заголовок). Пропуск выдаётся в манифесте, живёт час и
 *   не даёт доступа ни к чему, кроме чтения этого файла.
 *
 * Пропуск — сознательный компромисс, а не забытый запрет: постоянный
 * секрет устройства в URL действительно не используется, а содержимое
 * неизменяемо, поэтому даже перехваченный адрес через неделю бесполезен.
 */
type Context = { params: Promise<{ mediaId: string }> }

export const GET = route(async (request: Request, context: Context) => {
  const { mediaId } = await context.params
  const url = new URL(request.url)
  const ticket = url.searchParams.get('t')

  if (ticket) {
    const verdict = verifyMediaTicket(ticket, mediaId)

    if (!verdict.ok) {
      // 410 вместо 403: адрес недействителен по времени, а не запрещён.
      throw new HttpError(410, 'ticket_' + verdict.reason, 'Ссылка на файл устарела')
    }

    const asset = db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).get()
    if (!asset || asset.state !== 'ready') {
      throw HttpError.notFound('Файл недоступен')
    }

    return serveFile({
      path: assetPaths(asset).playback,
      mime: asset.mime,
      range: request.headers.get('range'),
      cacheControl: 'private, max-age=86400, immutable',
    })
  }

  // Запасной путь: файл запрашивается напрямую с заголовком.
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

  if (!token) {
    throw HttpError.unauthorized('Требуется токен устройства')
  }

  const identity = authenticateAccessToken(token)

  enforceRateLimit(
    keyOf('player:media', identity.screenId),
    { limit: 900, windowMs: 10 * 60_000 },
    'Слишком много запросов файлов с одного экрана.',
  )

  const asset = db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.companyId, identity.companyId)))
    .get()

  if (!asset || asset.state !== 'ready') {
    throw HttpError.notFound('Файл недоступен')
  }

  // Версия учётных данных должна совпадать: иначе отозванное устройство
  // продолжало бы качать контент по старому токену.
  const credential = db
    .select({ id: deviceCredentials.id })
    .from(deviceCredentials)
    .where(
      and(
        eq(deviceCredentials.screenId, identity.screenId),
        eq(deviceCredentials.version, identity.credentialVersion),
      ),
    )
    .get()

  if (!credential) {
    throw HttpError.unauthorized('Устройство не привязано')
  }

  return serveFile({
    path: assetPaths(asset).playback,
    mime: asset.mime,
    range: request.headers.get('range'),
    cacheControl: 'private, max-age=86400, immutable',
  })
})
