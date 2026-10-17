import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { createPlaylist, listPlaylists } from '@/server/services/playlist-service'
import { requireDashboardMutation, requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { HttpError } from '@/server/http/errors'

const createSchema = z.object({
  name: z.string().min(1).max(120),
})

/** Список плейлистов компании. */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.playlistsRead, 'Нет доступа к плейлистам')

  return jsonResponse({ playlists: listPlaylists(companyId) })
})

export const POST = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на создание плейлистов')

  const body = createSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Укажите название плейлиста')
  }

  const created = createPlaylist({
    companyId,
    actorUserId: session.userId,
    name: body.data.name,
  })

  return jsonResponse(created, { status: 201 })
})
