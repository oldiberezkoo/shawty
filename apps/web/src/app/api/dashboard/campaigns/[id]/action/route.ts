import { z } from 'zod'
import { route, jsonResponse, readJsonBody, type RouteContext } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requirePermission } from '@/server/http/dashboard-request'
import { changeCampaignStatus } from '@/server/services/campaign-service'
import { publishScreens } from '@/server/services/release-service'
import { resolveScreens } from '@/server/services/schedule-service'
import { loadCandidates } from '@/server/services/schedule-service'
import { HttpError } from '@/server/http/errors'

const actionSchema = z.object({
  action: z.enum(['approve', 'activate', 'end', 'archive', 'publish_now']),
})

/**
 * Действия над кампанией.
 *
 * Согласование отделено от редактирования: право `campaigns:approve` есть не
 * у редактора, который готовит кампанию. Это разделение — требование ТЗ, и
 * без него «согласование» было бы второй кнопкой «сохранить».
 *
 * `publish_now` выпускает публикацию для экранов кампании прямо сейчас. Это
 * не обход расписания, а его ускорение: окна кампании всё равно проверяются
 * решателем, и если сейчас она не идёт, публикация покажет то, что идёт.
 */
export const POST = route(async (request: Request, context: RouteContext<{ id: string }>) => {
  const { companyId, access, session } = await requireDashboardMutation(request)

  const { id } = await context.params
  const body = actionSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Неизвестное действие с кампанией')
  }

  if (body.data.action === 'approve') {
    requirePermission(access, PERMISSIONS.campaignsApprove, 'Согласование кампании доступно не всем ролям')
  } else {
    requirePermission(access, PERMISSIONS.campaignsWrite, 'Нет прав на операции с кампанией')
  }

  if (body.data.action === 'publish_now') {
    requirePermission(access, PERMISSIONS.releasesPublish, 'Нет прав на публикацию')

    const screens = screensOfCampaign(companyId, id)
    const published = publishScreens({
      companyId,
      screenIds: screens,
      actorUserId: session.userId,
      reason: 'ручная публикация кампании',
      campaignId: id,
    })

    return jsonResponse({ ok: true, published })
  }

  const result = changeCampaignStatus({
    companyId,
    campaignId: id,
    actorUserId: session.userId,
    action: body.data.action,
  })

  return jsonResponse({ ok: true, ...result })
})

/**
 * Экраны кампании: объединение её областей.
 *
 * Расширение по областям, а не выборка «чьё сейчас играет эту кампанию»:
 * публикация по кнопке означает «покажи это сейчас», а не «покажи то, что
 * уже показывается», и иначе кнопка была бы бесполезной.
 */
function screensOfCampaign(companyId: string, campaignId: string): string[] {
  const candidate = loadCandidates(companyId).find((entry) => entry.id === campaignId)

  if (!candidate) {
    // Кампания не участвует в расписании (черновик или не согласована) —
    // публиковать нечего: показывать её на экранах до согласования нельзя.
    throw HttpError.conflict('campaign_not_live', 'Кампания не запущена: сначала согласуйте её')
  }

  const ids = new Set<string>()

  for (const target of candidate.targets) {
    for (const screenId of resolveScreens(companyId, target.scopeType, target.scopeId)) {
      ids.add(screenId)
    }
  }

  return [...ids]
}