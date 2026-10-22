import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requirePermission } from '@/server/http/dashboard-request'
import { changePlan, getSubscription } from '@/server/services/billing-service'
import { completePlanOnboarding } from '@/server/services/company-service'
import { HttpError } from '@/server/http/errors'

/**
 * Выбор тарифа на первом входе.
 *
 * Отдельный маршрут, а не флаг в теле смены тарифа: он отмечает, что владелец
 * осознанно прошёл онбординг. После этого модалка не возвращается, даже если
 * тариф позже поменяют в разделе «Тариф».
 */
export const POST = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)

  requirePermission(access, PERMISSIONS.billingWrite, 'Выбор тарифа доступен только владельцу')

  const body = z
    .object({ planId: z.string().min(1).max(64) })
    .safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Не указан тариф')
  }

  const result = changePlan({
    companyId,
    planId: body.data.planId,
    actorUserId: session.userId,
  })

  completePlanOnboarding(companyId)

  const subscription = getSubscription(companyId)

  return jsonResponse({
    ok: true,
    plan: result.plan,
    // Понижение ниже потребления не блокируется, но интерфейс должен
    // показать, что именно перестанет работать.
    overLimit: result.blocked,
    usage: subscription.usage,
  })
})
