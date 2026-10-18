import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { createCampaign, listCampaigns } from '@/server/services/campaign-service'
import { companyToday } from '@/server/services/schedule-service'
import { HttpError } from '@/server/http/errors'

/** Окно показа в редакторе расписания. */
export const windowSchema = z.object({
  daysOfWeek: z.number().int().min(1).max(127),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
  timezoneSource: z.enum(['branch', 'company', 'campaign']).default('branch'),
})

const targetSchema = z.object({
  scopeType: z.enum(['screen', 'group', 'branch', 'company']),
  scopeId: z.string().min(1).max(64),
})

/**
 * Тело кампании.
 *
 * Окна — массив, а не одиночная пара «часы начала и конца»: в реальной сети
 * «утро, день, вечер» — это три интервала, и без массива пришлось бы заводить
 * три кампании с одним и тем же контентом и надеяться на приоритет.
 */
export const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(['internal', 'commercial']).default('internal'),
  priority: z.number().int().min(-100).max(100).default(0),
  startsOn: z.string().min(8).max(10),
  endsOn: z.string().min(8).max(10).nullable().default(null),
  approvalRequired: z.boolean().default(false),
  playlistVersionId: z.string().min(1).max(64).nullable().default(null),
  fallbackPlaylistVersionId: z.string().min(1).max(64).nullable().default(null),
  timezoneOverride: z.string().min(1).max(64).nullable().default(null),
  targets: z.array(targetSchema).min(1).max(50),
  windows: z.array(windowSchema).max(20).default([]),
})

/**
 * Список кампаний.
 *
 * «Просрочена» считается по календарю компании, а не по часам сервера:
 * иначе кампания выглядела бы завершённой на несколько часов раньше, чем она
 * действительно закончилась по часам магазина.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.campaignsRead, 'Нет доступа к кампаниям')

  return jsonResponse({ campaigns: listCampaigns(companyId), today: companyToday(companyId) })
})

export const POST = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.campaignsWrite, 'Нет прав на создание кампаний')

  const body = campaignSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте название, даты, область и окна показа')
  }

  const created = createCampaign({ companyId, actorUserId: session.userId, input: body.data })

  return jsonResponse(created, { status: 201 })
})