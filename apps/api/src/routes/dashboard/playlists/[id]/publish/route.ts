import { route, jsonResponse } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { getPlaylist, publishPlaylist } from '@/server/services/playlist-service'
import { requireDashboardMutation, requirePermission } from '@/server/http/dashboard-request'

type Context = { params: Promise<{ id: string }> }

/**
 * Фиксация неизменяемой версии плейлиста.
 *
 * Это НЕ публикация на экраны: назначение экранам, доставка и подтверждение
 * делаются в P4. Здесь версия просто становится неизменяемым снимком, на
 * который потом ссылается публикация.
 */
export const POST = route(async (request: Request, context: Context) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  const { id } = await context.params

  requirePermission(access, PERMISSIONS.playlistsPublish, 'Нет прав на публикацию плейлистов')

  const result = publishPlaylist({ companyId, playlistId: id, actorUserId: session.userId })

  return jsonResponse({ ...result, playlist: getPlaylist(companyId, id) })
})
