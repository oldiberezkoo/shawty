import { Readable } from 'node:stream'
import { route, jsonResponse } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'
import { accessFor, assertCsrf } from '@/server/services/auth-service'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { HttpError } from '@/server/http/errors'
import { logger } from '@/lib/logger'
import { receiveToTempFile } from '@/media/store'
import {
  TMP_ROOT,
  ingestUpload,
  listFolders,
  listMedia,
  queueStats,
  storageUsage,
} from '@/server/services/media-service'

/**
 * Загрузка файла.
 *
 * Принимаем multipart целиком в память НЕЛЬЗЯ: ролики на сотни мегабайт
 * приходят с телефона, и буферизация в процессе убьёт всю систему.
 * Поток сразу пишется на диск.
 */
export const POST = route(async (request) => {
  const session = await requireSessionForApi()
  assertCsrf(session, request.headers.get('x-csrf-token'))

  const companyId = request.headers.get('x-company-id')
  if (!companyId) {
    throw HttpError.badRequest('invalid_input', 'Не указана компания')
  }

  const access = accessFor(session, companyId)
  if (!access.can(PERMISSIONS.mediaWrite)) {
    throw HttpError.forbidden('Нет прав на загрузку файлов')
  }

  const form = await request.formData().catch(() => {
    throw HttpError.badRequest('invalid_input', 'Ожидается multipart-запрос')
  })

  const file = form.get('file')
  if (!(file instanceof File)) {
    throw HttpError.badRequest('no_file', 'Файл не передан')
  }

  const folderRaw = form.get('folderId')
  const folderId = typeof folderRaw === 'string' && folderRaw.length > 0 ? folderRaw : null

  if (file.size === 0) {
    throw HttpError.badRequest('empty_file', 'Файл пустой')
  }

  const temporary = await receiveToTempFile(
    Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]),
    TMP_ROOT,
  )

  try {
    const result = await ingestUpload({
      companyId,
      actorUserId: session.userId,
      temporaryPath: temporary,
      // Имя файла сохраняется как есть: оператор должен узнавать свой файл в
      // медиатеке, а не гадать по разрешению и размеру.
      fileName: file.name,
      folderId,
    })

    logger.info(
      { companyId, assetId: result.assetId, bytes: file.size, deduplicated: result.deduplicated },
      'файл принят',
    )

    return jsonResponse(result, { status: result.deduplicated ? 200 : 202 })
  } catch (error) {
    logger.warn({ err: error, companyId, size: file.size }, 'файл отклонён')
    throw error
  }
})

/** Список медиатеки: файлы, папки, загрузка хранилища, состояние очереди. */
export const GET = route(async (request) => {
  const session = await requireSessionForApi()

  const companyId = request.headers.get('x-company-id')
  if (!companyId) {
    throw HttpError.badRequest('invalid_input', 'Не указана компания')
  }

  const access = accessFor(session, companyId)
  if (!access.can(PERMISSIONS.mediaRead)) {
    throw HttpError.forbidden('Нет доступа к медиатеке')
  }

  const url = new URL(request.url)

  const assets = listMedia(companyId, {
    kind: parseKind(url.searchParams.get('kind')),
    folderId: url.searchParams.get('folderId') ?? undefined,
    state: parseState(url.searchParams.get('state')),
    search: url.searchParams.get('search') ?? undefined,
  })

  return jsonResponse({
    // `hasPoster` считаем на сервере: клиент не должен знать про хеш и не
    // должен терять превью после очередного опроса списка.
    assets: assets.map((asset) => ({ ...asset, hasPoster: Boolean(asset.posterSha256) })),
    folders: listFolders(companyId),
    usage: storageUsage(companyId),
    queue: queueStats(),
  })
})

function parseKind(value: string | null): 'image' | 'video' | undefined {
  return value === 'image' || value === 'video' ? value : undefined
}

function parseState(value: string | null): 'processing' | 'ready' | 'failed' | undefined {
  return value === 'processing' || value === 'ready' || value === 'failed' ? value : undefined
}
