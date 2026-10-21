import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import {
  duplicatePlaylist,
  getPlaylist,
  listVersions,
  renamePlaylist,
  deletePlaylist,
} from '@/server/services/playlist-service'
import { requireDashboardMutation, requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { HttpError } from '@/server/http/errors'

const renameSchema = z.object({
  name: z.string().min(1).max(120),
})

type Context = { params: Promise<{ id: string }> }

export const GET = route(async (request: Request, context: Context) => {
  const { companyId, access } = await requireDashboardRequest(request)
  const { id } = await context.params

  requirePermission(access, PERMISSIONS.playlistsRead, 'Нет доступа к плейлистам')

  return jsonResponse({
    playlist: getPlaylist(companyId, id),
    versions: listVersions(companyId, id),
  })
})

export const PATCH = route(async (request: Request, context: Context) => {
  const { companyId, access } = await requireDashboardMutation(request)
  const { id } = await context.params

  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на изменение плейлистов')

  const body = renameSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Укажите название')
  }

  renamePlaylist(companyId, id, body.data.name)
  return jsonResponse({ ok: true })
})

export const DELETE = route(async (request: Request, context: Context) => {
  const { companyId, access } = await requireDashboardMutation(request)
  const { id } = await context.params

  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на удаление плейлистов')

  deletePlaylist(companyId, id)
  return jsonResponse({ ok: true })
})

/** Копирование вместе с составом. Новая копия начинается как черновик. */
export const POST = route(async (request: Request, context: Context) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  const { id } = await context.params

  requirePermission(access, PERMISSIONS.playlistsWrite, 'Нет прав на копирование плейлистов')

  return jsonResponse(duplicatePlaylist(companyId, id, session.userId), { status: 201 })
})
