import { requireSession } from '@/server/auth/require-session'
import { listScreens } from '@/server/services/screen-service'
import { MonitorSmartphone } from 'lucide-react'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { DataTable, type TableColumn } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { formatDeviceId } from '@/lib/ids'

export const dynamic = 'force-dynamic'

function relativeTime(seconds: number | null): string {
  if (seconds === null) return 'ни разу'
  if (seconds < 60) return `${seconds} сек назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100

  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few

  return many
}

const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Экран', primary: true },
  { key: 'group', label: 'Группа' },
  // Идентификатор и версия плеера — справочные: нужны при разборе «экран не
  // обновляется», но на телефоне занимают место и съедают читаемость.
  { key: 'deviceId', label: 'Идентификатор', secondary: true },
  { key: 'player', label: 'Плеер', secondary: true },
  { key: 'heartbeat', label: 'Связь', align: 'right' },
  { key: 'state', label: 'Состояние', align: 'right' },
]

/**
 * Парк экранов.
 *
 * Список разбит по филиалам, а не отсортирован в одну таблицу: экран без
 * филиала и экран филиала — это разные вещи, и в общем списке связь между ними
 * теряется. Внутри филиала таблица сворачивается в карточки, когда места
 * перестаёт хватать.
 */
export default async function ScreensPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const screens = listScreens(membership.companyId)

  if (screens.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="page-title">Экраны</h1>
        </div>

        <Card>
          <EmptyState
            title="Экранов пока нет"
            hint="Телевизор показывает код — введите его на странице подключения. QR нужен, только если удобнее отсканировать камерой телефона."
            icon={<MonitorSmartphone className="size-5" strokeWidth={1.75} />}
            action={
              <Link href="/pair">
                <Button size="sm" variant="primary">
                  Подключить экран
                </Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  const byBranch = new Map<string, typeof screens>()

  for (const screen of screens) {
    const key = screen.branchName ?? 'Без филиала'
    const list = byBranch.get(key) ?? []
    list.push(screen)
    byBranch.set(key, list)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Экраны</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {screens.length} {plural(screens.length, 'экран', 'экрана', 'экранов')} в {byBranch.size}{' '}
            {plural(byBranch.size, 'филиале', 'филиалах', 'филиалах')}. Состояние считается по времени
            последнего heartbeat, а не по наличию соединения на сервере.
          </p>
        </div>

        <Link href="/pair">
          <Button size="sm" variant="primary">
            Подключить экран
          </Button>
        </Link>
      </div>

      {[...byBranch.entries()].map(([branchName, items]) => (
        <Card key={branchName}>
          <CardHeader
            title={branchName}
            description={`${items.length} ${plural(items.length, 'экран', 'экрана', 'экранов')}`}
          />
          <CardBody className="p-0">
            <DataTable
              columns={COLUMNS}
              caption={`Экраны филиала «${branchName}»`}
              rowKey={(row) => String(row.id)}
              rows={items.map((screen) => ({
                id: screen.id,
                name: <span className="font-medium">{screen.name}</span>,
                group: screen.groupName ?? <span className="text-text-subtle">—</span>,
                deviceId: screen.deviceId ? (
                  <span className="font-mono text-[12px] text-text-muted">{formatDeviceId(screen.deviceId)}</span>
                ) : (
                  <span className="text-[12px] text-text-subtle">не выданы</span>
                ),
                player: screen.playerVersion ?? <span className="text-text-subtle">—</span>,
                heartbeat: (
                  <span className="tnum text-text-muted">{relativeTime(screen.lastSeenSecondsAgo)}</span>
                ),
                state: <StatusBadge state={screen.onlineState} />,
              }))}
            />
          </CardBody>
        </Card>
      ))}
    </div>
  )
}