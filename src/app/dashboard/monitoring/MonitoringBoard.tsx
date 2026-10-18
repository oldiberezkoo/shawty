'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/card'

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

const REFRESH_MS = 10_000

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

/**
 * Мониторинг: что лежит, что молчит и что было в ленте.
 *
 * Опрос сервера, а не пересчёт в браузере: инциденты открывает фоновый насос,
 * и панель показывает ровно то, что записано в базу. Считать «оффлайн» на
 * клиенте значило бы показать вторую версию правды рядом с первой.
 */
export function MonitoringBoard({ companyId }: { companyId: string }) {
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
        silent: SilentScreen[]
        openDowntimes: OpenDowntime[]
        feed: FeedItem[]
        errors: PlayerError[]
      }

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
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">Лежат прямо сейчас</span>
            <span className={`tnum text-3xl font-semibold tracking-[-0.02em] ${open.length > 0 ? 'text-warn' : 'text-success'}`}>
              {open.length}
            </span>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">Молчат дольше порога</span>
            <span className={`tnum text-3xl font-semibold tracking-[-0.02em] ${silent.length > 0 ? 'text-warn' : 'text-success'}`}>
              {silent.length}
            </span>
          </CardBody>
        </Card>
      </div>

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
                      <Link href="/dashboard/screens" className="hover:underline underline-offset-4">
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