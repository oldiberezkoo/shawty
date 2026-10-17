import Link from 'next/link'
import { requireSession } from '@/server/auth/require-session'
import { listBranches, listScreens, summarizeScreens } from '@/server/services/screen-service'
import { plans, subscriptions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Dot, StatusBadge } from '@/components/ui/status-badge'

export const dynamic = 'force-dynamic'

function StatTile({ label, value, tone = 'default', hint }: {
  label: string
  value: number
  tone?: 'default' | 'success' | 'warn' | 'danger'
  hint?: string
}) {
  const toneClass = {
    default: 'text-text',
    success: 'text-success',
    warn: 'text-warn',
    danger: 'text-danger',
  }[tone]

  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-[12px] text-text-muted">{label}</span>
        <span className={`tnum text-2xl font-semibold tracking-[-0.02em] ${toneClass}`}>{value}</span>
        {hint ? <span className="text-[12px] text-text-subtle">{hint}</span> : null}
      </CardBody>
    </Card>
  )
}

function relativeTime(seconds: number | null): string {
  if (seconds === null) return 'ещё ни разу'
  if (seconds < 60) return `${seconds} сек назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

export default async function DashboardPage() {
  const session = await requireSession()
  const membership = session.companies[0]

  if (!membership) return null

  const companyId = membership.companyId
  const summary = summarizeScreens(companyId)
  const screens = listScreens(companyId)
  const branchList = listBranches(companyId)

  const subscription = db
    .select({ plan: plans, status: subscriptions.status, endsAt: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, companyId))
    .get()

  const daysLeft = subscription
    ? Math.ceil((subscription.endsAt.getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Обзор сети</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {membership.companyName} · филиалов: {branchList.length}
        </p>
      </div>

      {summary.needsAttention > 0 ? (
        <Card className="border-warn/40 bg-warn-bg">
          <CardBody className="flex items-start gap-3">
            <span className="mt-0.5">
              <Dot state="offline" />
            </span>
            <div className="text-[13px]">
              <div className="font-medium text-text">
                {summary.needsAttention}{' '}
                {summary.needsAttention === 1 ? 'экран требует' : 'экранов требуют'} внимания
              </div>
              <div className="mt-0.5 text-text-muted">
                {summary.offline > 0 ? `${summary.offline} без связи. ` : ''}
                {summary.unpaired > 0 ? `${summary.unpaired} ждут повторной привязки.` : ''}
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Всего экранов" value={summary.total} />
        <StatTile label="Онлайн" value={summary.online} tone="success" />
        <StatTile label="Синхронизируют" value={summary.syncing} />
        <StatTile label="Нет связи" value={summary.offline} tone={summary.offline > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            title="Экраны по филиалам"
            description="Состояние считается по живому соединению, а не только по времени heartbeat."
            action={
              <Link
                href="/dashboard/screens"
                className="text-[13px] text-text-muted hover:text-text transition-colors"
              >
                Все экраны
              </Link>
            }
          />
          <CardBody className="p-0">
            <table className="w-full text-[13px]">
              <tbody>
                {screens.slice(0, 8).map((screen) => (
                  <tr key={screen.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{screen.name}</div>
                      <div className="text-[12px] text-text-subtle">{screen.branchName ?? 'Без филиала'}</div>
                    </td>
                    <td className="w-[140px] px-5 py-2.5 text-right text-[12px] text-text-muted">
                      {relativeTime(screen.lastSeenSecondsAgo)}
                    </td>
                    <td className="w-[150px] px-5 py-2.5 text-right">
                      <StatusBadge state={screen.onlineState} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Подписка" />
            <CardBody className="flex flex-col gap-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Тариф</span>
                <span className="font-medium">{subscription?.plan.name ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Экранов использовано</span>
                <span className="tnum font-medium">
                  {summary.total} / {subscription?.plan.screensLimit ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Продление</span>
                <span className={`font-medium ${daysLeft !== null && daysLeft <= 7 ? 'text-warn' : ''}`}>
                  {daysLeft !== null ? `через ${daysLeft} дн` : '—'}
                </span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Быстрые действия" />
            <CardBody className="flex flex-col gap-2">
              <Link
                href="/pair"
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-[13px] transition-colors hover:bg-surface-2"
              >
                <span>Подключить экран</span>
                <span className="text-text-subtle">QR</span>
              </Link>
              <Link
                href="/dashboard/screens"
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-[13px] transition-colors hover:bg-surface-2"
              >
                <span>Список экранов</span>
                <span className="text-text-subtle">{summary.total}</span>
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
