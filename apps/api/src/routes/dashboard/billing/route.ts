import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { changePlan, getSubscription, listPlans } from '@/server/services/billing-service'
import { isOnboardingCompleted } from '@/server/services/company-service'
import { HttpError } from '@/server/http/errors'

/**
 * Тариф и потребление.
 *
 * Тарифы отдаются всегда, а менять их может только владелец: покупка —
 * решение компании, и право `billing:write` есть ровно у него.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.billingRead, 'Нет доступа к тарифу')

  const subscription = getSubscription(companyId)

  return jsonResponse({
    subscription: {
      plan: subscription.plan,
      status: subscription.status,
      daysLeft: subscription.daysLeft,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      notice: subscription.notice,
    },
    addons: subscription.addons,
    /** Тариф плюс докупленные опции — то, что владелец увидит в счёте. */
    monthlyTotalCents: (subscription.plan?.monthlyPriceCents ?? 0) + subscription.addons.monthlyPriceCents,
    usage: subscription.usage,
    plans: listPlans(),
    canChangePlan: access.can(PERMISSIONS.billingWrite),
    /** Первый вход: тариф ещё не выбран, панель показывает модалку. */
    onboardingCompleted: isOnboardingCompleted(companyId),
  })
})

export const PATCH = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.billingWrite, 'Смена тарифа доступна только владельцу')

  const body = z.object({ planId: z.string().min(1).max(64) }).safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Не указан тариф')
  }

  const result = changePlan({ companyId, planId: body.data.planId, actorUserId: session.userId })

  const subscription = getSubscription(companyId)

  return jsonResponse({
    ok: true,
    plan: result.plan,
    // Превышения возвращаются, а не блокируют смену: понижение ниже текущего
    // потребления допустимо, но интерфейс обязан показать, что именно перестанет
    // работать. Молча обрезать сеть было бы хуже, чем показать предупреждение.
    overLimit: result.blocked,
    addons: subscription.addons,
    usage: subscription.usage,
    notice: subscription.notice,
  })
})