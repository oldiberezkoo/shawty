import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { getSubscription, listPlans } from '@/server/services/billing-service'
import { BillingBoard } from './BillingBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Тариф' }

export default async function BillingPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const companyId = membership.companyId
  const subscription = getSubscription(companyId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Тариф и потребление</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-text-muted">
          Сколько экранов, сотрудников и места осталось по тарифу. Оплата вносится вручную: подключение
          платёжного провайдера — отдельное решение и не входит в эту версию.
        </p>
      </div>

      <BillingBoard
        companyId={companyId}
        canChangePlan={access.can(PERMISSIONS.billingWrite)}
        state={{
          plan: subscription.plan,
          status: subscription.status,
          daysLeft: subscription.daysLeft,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
          notice: subscription.notice,
        }}
        usage={subscription.usage}
        plans={listPlans()}
      />
    </div>
  )
}