import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { ScheduleBoard } from './ScheduleBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Расписание' }

export default async function SchedulingPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Расписание</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Что должно идти на каждом экране сейчас и когда программа сменится. Окна считаются в часовом поясе
          филиала: «с 09:00» в Самарканде и в Ташкенте — это разное время.
        </p>
      </div>

      <ScheduleBoard companyId={membership.companyId} />
    </div>
  )
}