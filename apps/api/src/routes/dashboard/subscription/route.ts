import { route, jsonResponse } from '@/server/http/request'
import { requireDashboardRequest } from '@/server/http/dashboard-request'
import { getSubscription } from '@/server/services/billing-service'

/** Краткий статус подписки для шапки дашборда: без права на биллинг. */
export const GET = route(async (request: Request) => {
  const { companyId } = await requireDashboardRequest(request)
  const subscription = getSubscription(companyId)

  return jsonResponse({
    plan: subscription.plan,
    status: subscription.status,
    daysLeft: subscription.daysLeft,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    notice: subscription.notice,
    usage: subscription.usage,
  })
})
