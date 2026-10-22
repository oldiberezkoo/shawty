import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { MonitoringBoard } from '@/features/monitoring/ui/MonitoringBoard'
import { AvailabilityReport } from '@/features/monitoring/ui/AvailabilityReport'
import { CampaignReportCard } from '@/features/monitoring/ui/CampaignReportCard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Мониторинг' }

export default async function MonitoringPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Мониторинг</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Кто на связи, как быстро отвечает и что показывает. Замеры присылает сам плеер: платформа, пинг, скорость и
          отклик. Простой считается от последнего heartbeat, поэтому время в отчёте верно даже если насос отстал.
          Отчёт за период и выгрузка — на экране «Аналитика».
        </p>
      </div>

      <MonitoringBoard companyId={membership.companyId} />
      <AvailabilityReport companyId={membership.companyId} />
      <CampaignReportCard companyId={membership.companyId} />
    </div>
  )
}