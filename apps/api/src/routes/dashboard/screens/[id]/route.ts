import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { screens } from '@/db/schema'
import { route, jsonResponse, readJsonBody, type RouteContext } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requireDashboardRequest } from '@/server/http/dashboard-request'
import { getScreenDetail, updateScreen } from '@/server/services/screen-service'
import { versionItems } from '@/server/services/playlist-service'
import { HttpError } from '@/server/http/errors'

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  branchId: z.string().max(64).nullable().optional(),
  groupId: z.string().max(64).nullable().optional(),
  offlineAfterSec: z.number().int().min(30).max(3600).optional(),
})

type Context = RouteContext<{ id: string }>

/**
 * Карточка одного экрана.
 *
 * Права проверяются с учётом области: сотрудник с доступом к одному филиалу
 * не должен видеть чужой экран по прямому адресу.
 */
export const GET = route(async (request: Request, context: Context) => {
  const { companyId, access } = await requireDashboardRequest(request)
  const { id } = await context.params

  const screen = db.select().from(screens).where(eq(screens.id, id)).get()
  if (!screen || screen.companyId !== companyId) throw HttpError.notFound('Экран не найден')

  if (!access.canAccess(PERMISSIONS.screensRead, { branchId: screen.branchId, groupId: screen.groupId, screenId: id })) {
    throw HttpError.forbidden('Нет доступа к этому экрану')
  }

  const detail = getScreenDetail(companyId, id)

  return jsonResponse({
    screen: detail,
    items: detail.planned ? versionItems(detail.planned.id) : [],
  })
})

export const PATCH = route(async (request: Request, context: Context) => {
  const { companyId, access } = await requireDashboardMutation(request)
  const { id } = await context.params

  const screen = db.select().from(screens).where(eq(screens.id, id)).get()
  if (!screen || screen.companyId !== companyId) throw HttpError.notFound('Экран не найден')

  if (!access.canAccess(PERMISSIONS.screensWrite, { branchId: screen.branchId, groupId: screen.groupId, screenId: id })) {
    throw HttpError.forbidden('Нет прав на изменение этого экрана')
  }

  const body = patchSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте название, филиал и группу')
  }

  updateScreen({ companyId, screenId: id, ...body.data })

  return jsonResponse({ screen: getScreenDetail(companyId, id) })
})
