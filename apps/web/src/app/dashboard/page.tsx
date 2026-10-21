import Link from 'next/link'
import { ArrowRight, CalendarClock, Megaphone, MonitorSmartphone, RefreshCw, Send, Wifi, WifiOff } from 'lucide-react'
import { requireSession } from '@/server/auth/require-session'
import { apiGet } from '@/server/api'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/card'
import { Notice, StatusBadge } from '@/components/ui/status-badge'
import { MetricTile, UsageBar } from '@/components/ui/metric'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

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

  const [screensData, structure, subscription] = await Promise.all([
    apiGet<{ screens: any[]; summary: any }>('/api/dashboard/screens', companyId),
    apiGet<{ branches: any[] }>('/api/dashboard/structure', companyId),
    apiGet<any>('/api/dashboard/subscription', companyId),
  ])

  const screens = screensData.screens
  const summary = screensData.summary
  const branches = structure.branches

  const offlineScreens = screens.filter((screen) => screen.onlineState === 'offline')
  const unpairedScreens = screens.filter((screen) => screen.recordStatus === 'unpaired')

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Обзор сети"
        description={`${membership.companyName} · ${branches.length} ${plural(branches.length, 'филиал', 'филиала', 'филиалов')} · ${summary.total} ${plural(summary.total, 'экран', 'экрана', 'экранов')}`}
        actions={
          <Link href="/pair">
            <Button size="md" variant="primary">
              Подключить экран
            </Button>
          </Link>
        }
      />

      {summary.needsAttention > 0 ? (
        // Предупреждение о состоянии сети: говорит, что не так и куда идти.
        // Раньше это была карточка с точкой, по весу равная обычному блоку
        // данных. Тон отказа делает её заметной до того, как её прочитают.
        <Notice
          tone={offlineScreens.length > 0 ? 'warn' : 'info'}
          title={`${summary.needsAttention} ${plural(summary.needsAttention, 'экран требует', 'экрана требуют', 'экранов требуют')} внимания`}
          action={
            <Link href="/dashboard/monitoring">
              <Button size="sm">
                К мониторингу
                <ArrowRight className="size-3.5" strokeWidth={1.9} />
              </Button>
            </Link>
          }
        >
          {offlineScreens.length > 0
            ? `${offlineScreens.length} ${plural(offlineScreens.length, 'экран', 'экрана', 'экранов')} без связи. `
            : ''}
          {unpairedScreens.length > 0
            ? `${unpairedScreens.length} ${plural(unpairedScreens.length, 'ждёт', 'ждут', 'ждут')} повторной привязки.`
            : ''}
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          label="Всего экранов"
          value={summary.total}
          icon={<MonitorSmartphone className="size-4" strokeWidth={1.75} />}
        />
        <MetricTile
          label="Онлайн"
          value={summary.online}
          tone="success"
          icon={<Wifi className="size-4" strokeWidth={1.75} />}
        />
        <MetricTile
          label="Синхронизируют"
          value={summary.syncing}
          tone={summary.syncing > 0 ? 'info' : 'default'}
          icon={<RefreshCw className="size-4" strokeWidth={1.75} />}
        />
        <MetricTile
          label="Нет связи"
          value={summary.offline}
          tone={summary.offline > 0 ? 'warn' : 'default'}
          icon={<WifiOff className="size-4" strokeWidth={1.75} />}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            title="Экраны"
            description="Состояние считается по времени последнего heartbeat, а не по наличию соединения на сервере."
            action={
              <Link
                href="/dashboard/screens"
                className="inline-flex items-center gap-1 text-[12.5px] text-text-muted transition-colors hover:text-text"
              >
                Все экраны
                <ArrowRight className="size-3.5" strokeWidth={1.9} />
              </Link>
            }
          />
          <CardBody className="p-0">
            {screens.length === 0 ? (
              <EmptyState
                title="Экранов пока нет"
                hint="Телевизор показывает код — введите его на странице подключения. QR нужен только если удобнее камерой телефона."
                action={
                  <Link href="/pair">
                    <Button size="sm" variant="primary">
                      Подключить экран
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {screens.slice(0, 6).map((screen) => (
                  <li
                    key={screen.id}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60"
                  >
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
                <Link
                  href="/dashboard/billing"
                  className="text-[12.5px] text-text-muted transition-colors hover:text-text"
                >
                  Тариф
                </Link>
              }
            />
            <CardBody className="flex flex-col gap-4">
              {subscription.plan ? (
                <>
                  {subscription.usage.map((line: any) => (
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
            <CardBody className="flex flex-col gap-1">
              <QuickAction href="/pair" icon={<MonitorSmartphone className="size-4" strokeWidth={1.75} />}>
                Подключить экран
              </QuickAction>
              <QuickAction href="/dashboard/campaigns" icon={<Megaphone className="size-4" strokeWidth={1.75} />}>
                Создать кампанию
              </QuickAction>
              <QuickAction href="/dashboard/scheduling" icon={<CalendarClock className="size-4" strokeWidth={1.75} />}>
                Настроить расписание
              </QuickAction>
              <QuickAction href="/dashboard/releases" icon={<Send className="size-4" strokeWidth={1.75} />}>
                Опубликовать контент
              </QuickAction>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * Строка быстрого действия.
 *
 * Ссылка, а не кнопка: уход на другой экран — это переход, а не действие,
 * которое что-то меняет здесь. Кнопка обещала бы мгновенный результат, а
 * человек получал бы новую страницу — и это ровно тот разрыв между
 * обещанием и поведением, из-за которого интерфейс кажется обманчивым.
 */
function QuickAction({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group -mx-1 flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-[13px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      <span className="text-text-subtle transition-colors group-hover:text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ArrowRight
        className="size-3.5 shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100"
        strokeWidth={1.9}
      />
    </Link>
  )
}
