import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { getPlaylist, removeItem, setItemDuration } from '@/server/services/playlist-service'
import { syncPlaylistToScreens } from '@/server/services/playlist-sync-service'
import { requireDashboardMutation, requirePermission } from '@/server/http/dashboard-request'
import { HttpError } from '@/server/http/errors'

type Context = { params: Promise<{ id: string; itemId: string }> }

const patchSchema = z.object({
  /**
   * Длительность показа. `null` — снять переопределение и вернуться к
   * длительности файла или к настройке компании.
   */
  durationMs: z.number().int().min(0).max(600_000).nullable(),
})

/** Удаление элемента. Позиции оставшихся схлопываются. */
export const DELETE = route(async (request: Request, context: Context) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  const { id, itemId } = await context.params

  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на изменение плейлистов')

  removeItem(companyId, id, itemId)
  const sync = syncPlaylistToScreens({ companyId, playlistId: id, actorUserId: session.userId })
  return jsonResponse({ sync, playlist: getPlaylist(companyId, id) })
})

/** Правка слайда: пока только длительность, но растёт она здесь. */
export const PATCH = route(async (request: Request, context: Context) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  const { id, itemId } = await context.params

  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на изменение плейлистов')

  const body = patchSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Укажите длительность показа в миллисекундах')
  }

  setItemDuration({ companyId, playlistId: id, itemId, durationMs: body.data.durationMs })
  const sync = syncPlaylistToScreens({ companyId, playlistId: id, actorUserId: session.userId })
  return jsonResponse({ sync, playlist: getPlaylist(companyId, id) })
})
