'use client'

import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Sparkline } from '@/features/screens/ui/Sparkline'
import { deviceHint, formatMbps, formatSilence, formatTime } from '../format'
import type { DeviceRow } from '../model'

/** Устройства и их связь: пинг, скорость и отклик с историей за сутки. */
export function DeviceTable(props: { devices: DeviceRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Устройства и связь"
        description="Пинг и скорость — со слов самого телевизора (оценка браузера, а не спидтест), замер раз в 4 минуты. График — почасовая история за сутки: провал вечером виден сразу. Прочерк значит «плеер не сообщает это поле», а не ноль."
      />
      <CardBody className="p-0">
        {props.devices.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-text-subtle">
            Экранов пока нет. <Link href="/dashboard/screens" className="text-primary hover:underline">Подключите первый экран</Link>.
          </p>
        ) : (
          <div className="@container w-full overflow-x-auto">
            <table className="stack-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="px-5 py-2 font-normal">Экран</th>
                  <th className="px-5 py-2 font-normal">Устройство</th>
                  <th className="px-5 py-2 font-normal">Связь</th>
                  <th className="px-5 py-2 font-normal">Ping</th>
                  <th className="px-5 py-2 font-normal">Скорость</th>
                  <th className="px-5 py-2 font-normal">Отклик</th>
                  <th className="px-5 py-2 font-normal">Замер</th>
                </tr>
              </thead>
              <tbody>
                {props.devices.map((device) => {
                  const sample = device.telemetry

                  return (
                    <tr key={device.id} className="border-b border-border last:border-0">
                      <td data-primary className="px-5 py-2">
                        <Link href={`/dashboard/screens/${device.id}`} className="font-medium hover:underline underline-offset-4">
                          {device.name}
                        </Link>
                        <span className="block text-[12px] text-text-subtle">{device.branchName ?? 'Без филиала'}</span>
                      </td>
                      <td data-label="Устройство" className="px-5 py-2">
                        <span className="text-text-muted">{device.platform ?? '—'}</span>
                        <span className="block text-[12px] text-text-subtle">{deviceHint(device)}</span>
                      </td>
                      <td data-label="Связь" className="px-5 py-2">
                        <StatusBadge state={device.onlineState} />
                        <span className="mt-0.5 block text-[12px] text-text-subtle">
                          {device.lastSeenSecondsAgo === null
                            ? 'не выходил на связь'
                            : `был ${formatSilence(device.lastSeenSecondsAgo)} назад`}
                        </span>
                        {device.pendingRelease ? (
                          <span className="block text-[12px] text-warn">ждёт публикацию</span>
                        ) : null}
                      </td>
                      <td data-label="Ping" className="px-5 py-2">
                        <div className="flex items-center gap-3">
                          <span className="tnum w-16 text-text-muted">
                            {sample?.pingMs !== null && sample?.pingMs !== undefined ? `${sample.pingMs} мс` : '—'}
                          </span>
                          <Sparkline values={device.history.map((point) => point.pingMs)} width={90} height={26} label={`Ping экрана ${device.name}`} />
                        </div>
                      </td>
                      <td data-label="Скорость" className="px-5 py-2">
                        <div className="flex items-center gap-3">
                          <span className="tnum w-24 text-text-muted">
                            {sample?.downlinkKbps !== null && sample?.downlinkKbps !== undefined
                              ? formatMbps(sample.downlinkKbps)
                              : '—'}
                          </span>
                          <Sparkline
                            values={device.history.map((point) => point.downlinkKbps)}
                            width={90}
                            height={26}
                            label={`Скорость экрана ${device.name}`}
                          />
                        </div>
                        {sample?.effectiveType ? (
                          <span className="mt-0.5 block text-[11px] text-text-subtle">{sample.effectiveType}</span>
                        ) : null}
                      </td>
                      <td data-label="Отклик" className="px-5 py-2 text-text-muted">
                        {sample?.stateLatencyMs !== null && sample?.stateLatencyMs !== undefined
                          ? `${sample.stateLatencyMs} мс`
                          : '—'}
                        {sample?.networkRttMs !== null && sample?.networkRttMs !== undefined ? (
                          <span className="block text-[12px] text-text-subtle">сеть: {sample.networkRttMs} мс</span>
                        ) : null}
                      </td>
                      <td data-label="Замер" className="px-5 py-2 text-text-subtle">
                        {sample ? formatTime(sample.at) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
