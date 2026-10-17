import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'
import { accessFor, assertCsrf } from '@/server/services/auth-service'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { createPlaylist, listPlaylists } from '@/server/services/playlist-service'
import { HttpError } from '@/server/http/errors'

const createSchema = z.object({
  companyId: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
})

/** Список плейлистов компании. */
export const GET = route(async (request) => {
  const session = await requireSessionForApi()
  const companyId = new URL(request.url).searchParams.get('companyId') ?? ''

  const access = accessFor(session, companyId)
  if (!access.can(PERMISSIONS.playlistsRead)) {
    throw HttpError.forbidden('Нет доступа к плейлистам')
  }

  return jsonResponse({ playlists: listPlaylists(companyId) })
})

export const POST = route(async (request) => {
  const session = await requireSessionForApi()
  assertCsrf(session, request.headers.get('x-csrf-token'))

  const body = createSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Укажите название плейлиста')
  }

  const access = accessFor(session, body.data.companyId)
  if (!access.can(PERMISSIONS.playlistsWrite)) {
    throw HttpError.forbidden('Нет прав на создание плейлистов')
  }

  const created = createPlaylist({
    companyId: body.data.companyId,
    actorUserId: session.userId,
    name: body.data.name,
  })

  return jsonResponse(created, { status: 201 })
})
