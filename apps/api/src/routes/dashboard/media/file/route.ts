import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { route, jsonResponse, clientIp } from '@/server/http/request'
import { recordAudit } from '@/server/services/audit-service'
import { requireSessionForApi } from '@/server/auth/require-session'
import { accessFor } from '@/server/services/auth-service'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { HttpError } from '@/server/http/errors'
import { assetPaths, deleteMedia, getAsset } from '@/server/services/media-service'

/**
 * Отдача файла из медиатеки панели.
 *
 * Служебный вариант: доступ по сессии сотрудника. Для телевизоров есть
 * отдельный маршрут с авторизацией устройства.
 */
export const GET = route(async (request) => {
  const session = await requireSessionForApi()

  const url = new URL(request.url)
  const companyId = url.searchParams.get('companyId') ?? ''
  const assetId = url.searchParams.get('assetId') ?? ''
  const variant = url.searchParams.get('variant') ?? 'playback'

  const access = accessFor(session, companyId)
  if (!access.can(PERMISSIONS.mediaRead)) {
    throw HttpError.forbidden('Нет доступа к медиатеке')
  }

  const asset = getAsset(companyId, assetId)
  if (!asset || asset.state !== 'ready') {
    throw HttpError.notFound('Файл недоступен')
  }

  const paths = assetPaths(asset)

  const target =
    variant === 'poster'
      ? paths.poster
      : variant === 'original'
        ? paths.original
        : paths.playback

  if (!target) {
    throw HttpError.notFound('Запрошенный вариант файла недоступен')
  }

  return serveFile({
    path: target,
    mime: variant === 'poster' ? 'image/jpeg' : asset.mime,
    range: request.headers.get('range'),
    cacheControl: 'private, max-age=300',
  })
})

/**
 * Разбор заголовка Range.
 *
 * Без поддержки 206 телевизор не перематывает видео, а при паузе и
 * переподключении к сети воспроизведение срывается вместо продолжения.
 */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null

  const [, startRaw = '', endRaw = ''] = match

  if (startRaw === '' && endRaw === '') return null

  if (startRaw === '') {
    // bytes=-N — последние N байт
    const suffix = Number.parseInt(endRaw, 10)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    const start = Math.max(0, size - suffix)
    return { start, end: size - 1 }
  }

  const start = Number.parseInt(startRaw, 10)
  const end = endRaw ? Number.parseInt(endRaw, 10) : size - 1

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start >= size || start > end) return null

  return { start, end: Math.min(end, size - 1) }
}

export async function serveFile(params: {
  path: string
  mime: string
  range: string | null
  cacheControl: string
}): Promise<Response> {
  let size: number
  try {
    size = (await stat(params.path)).size
  } catch {
    throw HttpError.notFound('Файл не найден на диске')
  }

  const range = parseRange(params.range, size)
  const stream = range
    ? createReadStream(params.path, { start: range.start, end: range.end })
    : createReadStream(params.path)

  const headers: Record<string, string> = {
    'content-type': params.mime,
    'accept-ranges': 'bytes',
    'cache-control': params.cacheControl,
  }

  if (range) {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`
    headers['content-length'] = String(range.end - range.start + 1)
  } else {
    headers['content-length'] = String(size)
  }

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: range ? 206 : 200,
    headers,
  })
}

export const DELETE = route(async (request) => {
  const session = await requireSessionForApi()

  const url = new URL(request.url)
  const companyId = url.searchParams.get('companyId') ?? ''
  const assetId = url.searchParams.get('assetId') ?? ''
  const force = url.searchParams.get('force') === 'true'

  const access = accessFor(session, companyId)
  if (!access.can(PERMISSIONS.mediaDelete)) {
    throw HttpError.forbidden('Нет прав на удаление файлов')
  }

  const outcome = await deleteMedia(companyId, assetId, force)

  // Запись только после успеха: журнал должен показывать то, что произошло,
  // а не то, что кто-то попытался сделать.
  if (outcome.ok) {
    recordAudit({
      companyId,
      actorUserId: session.userId,
      action: force ? 'media.forced_deleted' : 'media.deleted',
      targetType: 'media_asset',
      targetId: assetId,
      // Принудительное удаление обходит защиту занятости, и именно это важно
      // потом разбирать: файл мог показываться на экранах.
      meta: { force, sha256: outcome.asset.sha256 },
      ip: clientIp(request),
    })
  }

  if (!outcome.ok) {
    // 409: файл занят. Это конфликт состояния, а не ошибка запроса.
    // Тело собирается через общий jsonResponse, чтобы формат ответа
    // совпадал со всеми остальными маршрутами.
    throw new HttpError(
      409,
      'media_in_use',
      outcome.usage.published
        ? 'Файл входит в плейлист, назначенный на экраны. Сначала снимите назначение.'
        : `Файл используется в плейлистах: ${outcome.usage.playlists.map((playlist) => playlist.name).join(', ')}`,
      { usage: outcome.usage },
    )
  }

  return jsonResponse({ ok: true, assetId })
})
