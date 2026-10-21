import { route, jsonResponse, readJsonBody, type RouteContext } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { deleteCampaign, getCampaign, updateCampaign } from '@/server/services/campaign-service'
import { campaignSchema } from '@/app/api/dashboard/campaigns/route'
import { HttpError } from '@/server/http/errors'

export const GET = route(async (request: Request, context: RouteContext<{ id: string }>) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.campaignsRead, 'Нет доступа к кампаниям')

  const { id } = await context.params

  return jsonResponse({ campaign: getCampaign(companyId, id) })
})

export const PATCH = route(async (request: Request, context: RouteContext<{ id: string }>) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.campaignsWrite, 'Нет прав на изменение кампаний')

  const { id } = await context.params
  const body = campaignSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте название, даты, область и окна показа')
  }

  updateCampaign({ companyId, campaignId: id, actorUserId: session.userId, input: body.data })

  return jsonResponse({ campaign: getCampaign(companyId, id) })
})

/**
 * Удаление кампании.
 *
 * Разрешено только для неактивной. Активную сначала завершают: мгновенно
 * убрать правило, по которому сейчас идёт контент в магазине, означало бы,
 * что панель врёт оператору о том, что происходит на экранах.
 */
export const DELETE = route(async (request: Request, context: RouteContext<{ id: string }>) => {
  const { companyId, access } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.campaignsWrite, 'Нет прав на удаление кампаний')

  const { id } = await context.params

  deleteCampaign(companyId, id)

  return jsonResponse({ ok: true })
})