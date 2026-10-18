import Link from 'next/link'
import { requireSession } from '@/server/auth/require-session'
import { listBranches, listScreens, summarizeScreens } from '@/server/services/screen-service'
import { getSubscription } from '@/server/services/billing-service'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge, Dot, StatusBadge } from '@/components/ui/status-badge'
import { MetricTile, UsageBar } from '@/components/ui/metric'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

function relativeTime(seconds: number | null): string {
  if (seconds === null) return 'ещё ни разу'
  if (seconds < 60) return `${seconds} сек назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} МБ`
  return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100

  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few

  return many
}

/**
 * Обзор сети.
 *
 * Отвечает на два вопроса по порядку: «всё ли работает» и «сколько ещё можно
 * включить». Второй вопрос задаётся раньше третьего по важности, но раньше он
 * стоял в самом низу страницы, под таблицей экранов, — и его не замечали.
 */
export default async function DashboardPage() {
  const session = await requireSession()
  const membership = session.companies[0]

  if (!membership) return null

  const companyId = membership.companyId
  const summary = summarizeScreens(companyId)
  const screens = listScreens(companyId)
  const branches = listBranches(companyId)
  const subscription = getSubscription(companyId)

  const offlineScreens = screens.filter((screen) => screen.onlineState === 'offline')
  const unpairedScreens = screens.filter((screen) => screen.recordStatus === 'unpaired')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Обзор сети</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {membership.companyName} · {branches.length} {plural(branches.length, 'филиал', 'филиала', 'филиалов')} ·{' '}
            {summary.total} {plural(summary.total, 'экран', 'экрана', 'экранов')}
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/pair">
            <Button size="sm" variant="primary">
              Подключить экран
            </Button>
          </Link>
        </div>
      </div>

      {summary.needsAttention > 0 ? (
        // Предупреждение о состоянии сети: говорит, что не так и куда идти.
        <Card>
          <CardBody className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5">
                <Dot state="offline" />
              </span>
              <div className="text-[13px]">
                <div className="font-medium">
                  {summary.needsAttention}{' '}
                  {plural(summary.needsAttention, 'экран требует', 'экрана требуют', 'экранов требуют')} внимания
                </div>
                <div className="mt-0.5 leading-relaxed text-text-muted">
                  {offlineScreens.length > 0
                    ? `${offlineScreens.length} ${plural(offlineScreens.length, 'без связи', 'без связи', 'без связи')}. `
                    : ''}
                  {unpairedScreens.length > 0
                    ? `${unpairedScreens.length} ${plural(unpairedScreens.length, 'ждёт', 'ждут', 'ждут')} повторной привязки.`
                    : ''}
                </div>
              </div>
            </div>

            <Link href="/dashboard/monitoring">
              <Button size="sm">К мониторингу</Button>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Всего экранов" value={summary.total} />
        <MetricTile label="Онлайн" value={summary.online} tone="success" />
        <MetricTile label="Синхронизируют" value={summary.syncing} tone={summary.syncing > 0 ? 'info' : 'default'} />
        <MetricTile
          label="Нет связи"
          value={summary.offline}
          tone={summary.offline > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            title="Экраны"
            description="Состояние считается по времени последнего heartbeat, а не по наличию соединения на сервере."
            action={
              <Link href="/dashboard/screens" className="text-[13px] text-text-muted transition-colors hover:text-text">
                Все экраны
              </Link>
            }
          />
          <CardBody className="p-0">
            {screens.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-muted">
                Экранов пока нет. Откройте страницу подключения на телевизоре и отсканируйте QR-код.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {screens.slice(0, 6).map((screen) => (
                  <li key={screen.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{screen.name}</div>
                      <div className="truncate text-[12px] text-text-subtle">
                        {screen.branchName ?? 'Без филиала'}
                        {screen.groupName ? ` · ${screen.groupName}` : ''}
                      </div>
                    </div>

                    <span className="hidden shrink-0 text-[12px] text-text-muted sm:block">
                      {relativeTime(screen.lastSeenSecondsAgo)}
                    </span>

                    <StatusBadge state={screen.onlineState} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Запас тарифа"
              action={
                <Link href="/dashboard/billing" className="text-[13px] text-text-muted transition-colors hover:text-text">
                  Тариф
                </Link>
              }
            />
            <CardBody className="flex flex-col gap-4">
              {subscription.plan ? (
                <>
                  {subscription.usage.map((line) => (
                    <UsageBar
                      key={line.key}
                      label={line.label}
                      used={line.used}
                      limit={line.limit}
                      usedText={
                        line.kind === 'bytes'
                          ? formatBytes(line.used)
                          : `${line.used} ${plural(line.used, 'экран', 'экрана', 'экранов')}`
                      }
                      limitText={
                        line.kind === 'bytes'
                          ? formatBytes(line.limit)
                          : `${line.limit} ${plural(line.limit, 'экран', 'экрана', 'экранов')}`
                      }
                    />
                  ))}

                  <div className="border-t border-border pt-3 text-[12px] text-text-subtle">
                    {subscription.daysLeft !== null ? `Продление через ${subscription.daysLeft} дн` : 'Период не задан'}
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-text-muted">Подписка не настроена.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Быстрые действия" />
            <CardBody className="flex flex-col gap-2">
              <Link href="/pair">
                <Button size="sm" className="w-full justify-start">
                  Подключить экран по QR
                </Button>
              </Link>
              <Link href="/dashboard/campaigns">
                <Button size="sm" className="w-full justify-start">
                  Создать кампанию
                </Button>
              </Link>
              <Link href="/dashboard/releases">
                <Button size="sm" className="w-full justify-start">
                  Опубликовать контент
                </Button>
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Разделы" />
            <CardBody className="flex flex-wrap gap-2">
              <Link href="/dashboard/campaigns">
                <Badge>Кампании</Badge>
              </Link>
              <Link href="/dashboard/scheduling">
                <Badge>Расписание</Badge>
              </Link>
              <Link href="/dashboard/media">
                <Badge>Медиатека</Badge>
              </Link>
              <Link href="/dashboard/team">
                <Badge>Команда</Badge>
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}