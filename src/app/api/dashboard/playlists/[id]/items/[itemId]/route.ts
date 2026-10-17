import { route, jsonResponse } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { getPlaylist, removeItem } from '@/server/services/playlist-service'
import { requireDashboardMutation, requirePermission } from '@/server/http/dashboard-request'

type Context = { params: Promise<{ id: string; itemId: string }> }

/** Удаление элемента. Позиции оставшихся схлопываются. */
export const DELETE = route(async (request: Request, context: Context) => {
  const { companyId, access } = await requireDashboardMutation(request)
  const { id, itemId } = await context.params

  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на изменение плейлистов')

  removeItem(companyId, id, itemId)
  return jsonResponse({ playlist: getPlaylist(companyId, id) })
})
