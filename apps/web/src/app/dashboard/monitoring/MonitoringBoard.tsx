'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Sparkline } from '../screens/[id]/Sparkline'

type SilentScreen = {
  screenId: string
  screenName: string
  branchName: string | null
  silentSeconds: number
}

type OpenDowntime = {
  screenId: string
  screenName: string
  branchName: string | null
  openedAt: string
  silentSeconds: number | null
}

type FeedItem = {
  id: string
  screenId: string
  screenName: string
  type: string
  openedAt: string
  closedAt: string | null
  detail: string | null
  durationMs: number | null
}

type PlayerError = {
  screenId: string
  code: string
  message: string
  at: string
}

type TelemetrySample = {
  pingMs: number | null
  downlinkKbps: number | null
  networkRttMs: number | null
  stateLatencyMs: number | null
  effectiveType: string | null
  at: string
}

type TelemetryPoint = {
  at: string
  pingMs: number | null
  downlinkKbps: number | null
  networkRttMs: number | null
  stateLatencyMs: number | null
}

type DeviceRow = {
  id: string
  name: string
  branchName: string | null
  onlineState: 'online' | 'syncing' | 'offline' | 'error' | 'unpaired' | 'disabled' | 'revoked'
  lastSeenSecondsAgo: number | null
  playerVersion: string | null
  pendingRelease: boolean
  platform: string | null
  screenWidth: number | null
  screenHeight: number | null
  deviceMemoryGb: number | null
  hardwareConcurrency: number | null
  telemetry: TelemetrySample | null
  history: TelemetryPoint[]
}

type Totals = { screens: number; online: number; offline: number; inactive: number }

const REFRESH_MS = 10_000

/** Порядок в таблице: сначала то, что требует внимания. */
const DEVICE_STATE_ORDER: Record<DeviceRow['onlineState'], number> = {
  offline: 0,
  error: 0,
  syncing: 1,
  unpaired: 2,
  disabled: 3,
  revoked: 3,
  online: 4,
}

function sortDevices(devices: DeviceRow[]): DeviceRow[] {
  return [...devices].sort(
    (left, right) =>
      DEVICE_STATE_ORDER[left.onlineState] - DEVICE_STATE_ORDER[right.onlineState] ||
      left.name.localeCompare(right.name, 'ru'),
  )
}

const INCIDENT_LABEL: Record<string, string> = {
  offline: 'нет связи',
  reconnected: 'вернулся на связь',
  version_mismatch: 'устаревший плеер',
  storage_low: 'мало памяти',
  unpaired: 'потерял привязку',
  revoked: 'отозван доступ',
}

const INCIDENT_TONE: Record<string, string> = {
  offline: 'text-warn',
  reconnected: 'text-success',
  version_mismatch: 'text-danger',
  storage_low: 'text-warn',
  unpaired: 'text-danger',
  revoked: 'text-text-subtle',
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} с`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч`
  return `${Math.floor(hours / 24)} дн`
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatMbps(kbps: number | null): string {
  if (kbps === null) return '—'
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Мбит/с` : `${Math.round(kbps)} кбит/с`
}

function deviceHint(device: DeviceRow): string {
  const parts = [
    device.playerVersion ? `плеер ${device.playerVersion}` : null,
    device.screenWidth && device.screenHeight ? `${device.screenWidth}×${device.screenHeight}` : null,
    device.deviceMemoryGb ? `${device.deviceMemoryGb} ГБ ОЗУ` : null,
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(' · ') : 'данных об устройстве пока нет'
}

/**
 * Мониторинг: что лежит, что молчит и что было в ленте.
 *
 * Опрос сервера, а не пересчёт в браузере: инциденты открывает фоновый насос,
 * и панель показывает ровно то, что записано в базу. Считать «оффлайн» на
 * клиенте значило бы показать вторую версию правды рядом с первой.
 */
export function MonitoringBoard({ companyId }: { companyId: string }) {
  const [totals, setTotals] = useState<Totals>({ screens: 0, online: 0, offline: 0, inactive: 0 })
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [silent, setSilent] = useState<SilentScreen[]>([])
  const [open, setOpen] = useState<OpenDowntime[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [errors, setErrors] = useState<PlayerError[]>([])

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/monitoring', {
        headers: { 'x-company-id': companyId },
        cache: 'no-store',
      })

      if (!response.ok) return

      const data = (await response.json()) as {
        totals: Totals
        devices: DeviceRow[]
        silent: SilentScreen[]
        openDowntimes: OpenDowntime[]
        feed: FeedItem[]
        errors: PlayerError[]
      }

      setTotals(data.totals)
      setDevices(sortDevices(data.devices))
      setSilent(data.silent)
      setOpen(data.openDowntimes)
      setFeed(data.feed)
      setErrors(data.errors)
    } catch {
      // Фоновый опрос молча переживает обрыв: следующий тик попробует снова.
      // Мигающая ошибка в панели мониторинга сама была бы симптомом.
    }
  }, [companyId])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (!stopped) await load()
      if (!stopped) timer = setTimeout(tick, REFRESH_MS)
    }

    void tick()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [load])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">Всего экранов</span>
            <span className="tnum text-3xl font-semibold tracking-[-0.02em] text-text">{totals.screens}</span>
            <span className="text-[12px] text-text-subtle">
              в работе {totals.screens - totals.inactive}
              {totals.inactive > 0 ? ` · отключено или отвязано ${totals.inactive}` : ''}
            </span>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">На связи</span>
            <span className="tnum text-3xl font-semibold tracking-[-0.02em] text-success">{totals.online}</span>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">Нет связи</span>
            <span className={`tnum text-3xl font-semibold tracking-[-0.02em] ${totals.offline > 0 ? 'text-warn' : 'text-success'}`}>
              {totals.offline}
            </span>
            <span className="text-[12px] text-text-subtle">из {totals.screens - totals.inactive} рабочих</span>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">Открытых простоев</span>
            <span className={`tnum text-3xl font-semibold tracking-[-0.02em] ${open.length > 0 ? 'text-warn' : 'text-success'}`}>
              {open.length}
            </span>
            <span className="text-[12px] text-text-subtle">
              {silent.length > 0 ? `молчат сверх порога: ${silent.length}` : 'все отвечают вовремя'}
            </span>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Устройства и связь"
          description="Пинг и скорость — со слов самого телевизора (оценка браузера, а не спидтест), замер раз в 4 минуты. График — почасовая история за сутки: провал вечером виден сразу. Прочерк значит «плеер не сообщает это поле», а не ноль."
        />
        <CardBody className="p-0">
          {devices.length === 0 ? (
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
                  {devices.map((device) => {
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
                              : `был ${formatDuration(device.lastSeenSecondsAgo)} назад`}
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

      {open.length > 0 ? (
        <Card>
          <CardHeader
            title="Недоступные экраны"
            description="Простой считается от последнего heartbeat, а не от момента обнаружения: в отчёте время вёрно, даже если насос отстал."
          />
          <CardBody className="p-0">
            <div className="@container w-full overflow-x-auto">
            <table className="stack-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="px-5 py-2 font-normal">Экран</th>
                  <th className="px-5 py-2 font-normal">Филиал</th>
                  <th className="px-5 py-2 text-right font-normal">Молчит</th>
                  <th className="px-5 py-2 font-normal">С</th>
                </tr>
              </thead>
              <tbody>
                {open.map((row) => (
                  <tr key={row.screenId} className="border-b border-border last:border-0">
                    <td data-primary className="px-5 py-2 font-medium">
                      <Link href={`/dashboard/screens/${row.screenId}`} className="hover:underline underline-offset-4">
                        {row.screenName}
                      </Link>
                    </td>
                    <td data-label="Филиал" className="px-5 py-2 text-text-muted">{row.branchName ?? '—'}</td>
                    <td data-label="Молчит" className="tnum px-5 py-2 text-right text-warn">
                      {row.silentSeconds === null ? '—' : formatDuration(row.silentSeconds)}
                    </td>
                    <td data-label="С" className="px-5 py-2 text-text-muted">{formatTime(row.openedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Лента событий" description="Простой, возврат, потеря привязки и отзыв доступа — в порядке, когда они произошли." />
        <CardBody className="p-0">
          {feed.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-text-subtle">
              Событий пока нет. Это хороший знак: значит, сеть не теряла экраны.
            </p>
          ) : (
            <div className="@container w-full overflow-x-auto">
            <table className="stack-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="px-5 py-2 font-normal">Когда</th>
                  <th className="px-5 py-2 font-normal">Что произошло</th>
                  <th className="px-5 py-2 font-normal">Экран</th>
                  <th className="px-5 py-2 font-normal">Подробности</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td data-primary className="w-32 px-5 py-2 text-text-subtle">{formatTime(item.openedAt)}</td>
                    <td data-label="Что произошло" className={`px-5 py-2 ${INCIDENT_TONE[item.type] ?? 'text-text-muted'}`}>
                      {INCIDENT_LABEL[item.type] ?? item.type}
                    </td>
                    <td data-label="Экран" className="px-5 py-2 font-medium">{item.screenName}</td>
                    <td data-label="Подробности" className="px-5 py-2 text-text-muted">
                      {item.detail ?? '—'}
                      {item.durationMs !== null && item.type === 'offline' ? (
                        <span className="ml-2 text-text-subtle">
                          {item.closedAt ? `(${formatDuration(Math.round(item.durationMs / 1000))})` : '(идёт)'}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardBody>
      </Card>

      {errors.length > 0 ? (
        <Card>
          <CardHeader
            title="Ошибки воспроизведения"
            description="Что не смог показать плеер. Ошибка файла — это не простой: сеть жива, но материал не грузится."
          />
          <CardBody className="p-0">
            <div className="@container w-full overflow-x-auto">
            <table className="stack-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="px-5 py-2 font-normal">Когда</th>
                  <th className="px-5 py-2 font-normal">Код</th>
                  <th className="px-5 py-2 font-normal">Сообщение плеера</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((row, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td data-primary className="w-32 px-5 py-2 text-text-subtle">{formatTime(row.at)}</td>
                    <td data-label="Код" className="w-32 px-5 py-2 text-danger">{row.code}</td>
                    <td data-label="Сообщение плеера" className="px-5 py-2 text-text-muted">{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}