import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { addItems, getPlaylist, reorderItems } from '@/server/services/playlist-service'
import { requireDashboardMutation, requirePermission } from '@/server/http/dashboard-request'
import { HttpError } from '@/server/http/errors'

const addSchema = z.object({
  assetIds: z.array(z.string().min(1)).min(1).max(200),
  /** Длительность показа изображений; null — взять из ассета или по умолчанию. */
  durationMs: z.number().int().min(1000).max(600_000).nullable().optional(),
})

const orderSchema = z.object({
  orderedItemIds: z.array(z.string().min(1)).min(1).max(1000),
})

type Context = { params: Promise<{ id: string }> }

/** Добавление файлов из медиатеки в конец плейлиста. */
export const POST = route(async (request: Request, context: Context) => {
  const { companyId, access } = await requireDashboardMutation(request)
  const { id } = await context.params

  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на изменение плейлистов')

  const body = addSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Не выбраны файлы')
  }

  const result = addItems({
    companyId,
    playlistId: id,
    assetIds: body.data.assetIds,
    durationMs: body.data.durationMs ?? null,
  })

  return jsonResponse({ ...result, playlist: getPlaylist(companyId, id) })
})

/**
 * Перестановка элементов.
 *
 * Передаётся полный порядок идентификаторов, а не индексы: индексы устаревают
 * между отрисовкой и сохранением при любом параллельном изменении.
 */
export const PUT = route(async (request: Request, context: Context) => {
  const { companyId, access } = await requireDashboardMutation(request)
  const { id } = await context.params

  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на изменение плейлистов')

  const body = orderSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Некорректный порядок')
  }

  reorderItems(companyId, id, body.data.orderedItemIds)
  return jsonResponse({ playlist: getPlaylist(companyId, id) })
})
