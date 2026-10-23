import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { apiGet } from '@/server/api'
import { BillingBoard } from '@/features/billing/ui/BillingBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Тариф' }

export default async function BillingPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const companyId = membership.companyId
  const { subscription, usage, plans, addons, monthlyTotalCents } = await apiGet<{
    subscription: any
    usage: any[]
    plans: any[]
    addons: any
    monthlyTotalCents: number
  }>('/api/dashboard/billing', companyId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Тариф и потребление</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-text-muted">
          Сколько экранов, сотрудников и места осталось по тарифу. Экраны и хранилище можно докупить
          отдельно; оплата вносится вручную: подключение платёжного провайдера — отдельное решение и не
          входит в эту версию.
        </p>
      </div>

      <BillingBoard
        companyId={companyId}
        canChangePlan={access.can(PERMISSIONS.billingWrite)}
        state={{
          plan: subscription.plan,
          status: subscription.status,
          daysLeft: subscription.daysLeft,
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          trialEndsAt: subscription.trialEndsAt ?? null,
          notice: subscription.notice,
        }}
        usage={usage}
        plans={plans}
        addons={addons}
        monthlyTotalCents={monthlyTotalCents}
      />
    </div>
  )
}