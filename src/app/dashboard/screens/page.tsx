import { requireSession } from '@/server/auth/require-session'
import { listScreens } from '@/server/services/screen-service'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
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

export default async function ScreensPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const screens = listScreens(membership.companyId)

  const byBranch = new Map<string, typeof screens>()
  for (const screen of screens) {
    const key = screen.branchName ?? 'Без филиала'
    const list = byBranch.get(key) ?? []
    list.push(screen)
    byBranch.set(key, list)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Экраны</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Парк устройств компании: {screens.length} шт.
        </p>
      </div>

      {[...byBranch.entries()].map(([branchName, items]) => (
        <Card key={branchName}>
          <CardHeader
            title={branchName}
            description={`${items.length} экран(ов)`}
          />
          <CardBody className="p-0">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="px-5 py-2 font-normal">Название</th>
                  <th className="px-5 py-2 font-normal">Группа</th>
                  <th className="px-5 py-2 font-normal">Идентификатор</th>
                  <th className="px-5 py-2 font-normal">Плеер</th>
                  <th className="px-5 py-2 text-right font-normal">Heartbeat</th>
                  <th className="px-5 py-2 text-right font-normal">Состояние</th>
                </tr>
              </thead>
              <tbody>
                {items.map((screen) => (
                  <tr key={screen.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium">{screen.name}</td>
                    <td className="px-5 py-2.5 text-text-muted">{screen.groupName ?? '—'}</td>
                    <td className="px-5 py-2.5">
                      {screen.deviceId ? (
                        <span className="font-mono text-[12px] text-text-muted">
                          {formatDeviceId(screen.deviceId)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-subtle">учётные данные не выданы</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-text-muted">{screen.playerVersion ?? '—'}</td>
                    <td className="tnum px-5 py-2.5 text-right text-text-muted">
                      {relativeTime(screen.lastSeenSecondsAgo)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <StatusBadge state={screen.onlineState} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ))}

      {screens.length === 0 ? (
        <Card>
          <CardBody className="text-[13px] text-text-muted">
            Экранов пока нет. Подключите первый телевизор: он покажет QR-код, который нужно
            подтвердить в этой панели.
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
