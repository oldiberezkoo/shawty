'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CSRF_COOKIE } from '@/lib/cookie-names'

type AuditRow = {
  id: string
  action: string
  actionLabel: string
  targetType: string | null
  targetId: string | null
  meta: Record<string, unknown> | null
  ip: string | null
  at: string
  actorName: string | null
}

type ActorRow = { actorUserId: string | null; actorName: string | null; actions: number; lastActionAt: string }
type Group = { label: string; prefix: string }
type AuditResponse = {
  rows: AuditRow[]
  total: number
  actors: { actorUserId: string | null; actorName: string | null }[]
  byActor: ActorRow[]
  groups: Group[]
}

const PERIODS = [
  { label: 'Сутки', days: 1 },
  { label: 'Неделя', days: 7 },
  { label: 'Месяц', days: 30 },
  { label: 'Всё время', days: 3650 },
]

/**
 * Как выглядит действие в журнале.
 *
 * Подпись собирается из метаданных, а не из сырого идентификатора: «Экран
 * отвязан» без имени экрана бесполезны для того, кто разбирает инцидент.
 */
function describe(row: AuditRow): string {
  const meta = row.meta ?? {}
  const name = typeof meta.name === 'string' ? meta.name : null

  if (row.action === 'release.published' && typeof meta.version === 'number') {
    return `версия ${meta.version} для ${meta.screens ?? '?'} экранов`
  }

  if (row.action.startsWith('campaign.') && typeof meta.from === 'string') {
    return `${meta.from} → ${meta.to}`
  }

  if (row.action.startsWith('campaign.') && typeof meta.status === 'string') {
    return `состояние: ${meta.status}`
  }

  if (row.action === 'assignment.changed') {
    return `${row.targetType} · ${String(meta.screens ?? '?')} экранов`
  }

  return name ?? row.targetId ?? '—'
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/**
 * Журнал действий сотрудников.
 *
 * Читаемое имя действия вместо технического ключа, фильтр по группе и по
 * сотруднику. Счётчики по сотрудникам вынесены наверх: когда разбирается
 * инцидент, вопрос обычно «кто это сделал», а не «что записано в журнале».
 */
export function AuditLog({ companyId }: { companyId: string }) {
  const [days, setDays] = useState(7)
  const [group, setGroup] = useState('')
  const [actorUserId, setActorUserId] = useState('')
  const [data, setData] = useState<AuditResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (periodDays: number, groupPrefix: string, actor: string) => {
      setError(null)
      setBusy(true)

      try {
        const to = new Date()
        const from = new Date(to.getTime() - periodDays * 24 * 60 * 60_000)

        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          limit: '200',
        })

        if (groupPrefix) params.set('group', groupPrefix)
        if (actor) params.set('actorUserId', actor)

        const response = await fetch(`/api/dashboard/audit?${params.toString()}`, {
          headers: { 'x-company-id': companyId },
          cache: 'no-store',
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Не удалось загрузить журнал')
          return
        }

        setData((await response.json()) as AuditResponse)
      } catch {
        setError('Журнал недоступен')
      } finally {
        setBusy(false)
      }
    },
    [companyId],
  )

  useEffect(() => {
    void load(days, group, actorUserId)
    // Сброс зависит только от фильтров: перезагрузка при каждом рендере
    // превратила бы журнал в поток запросов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, group, actorUserId])

  /**
   * Выгрузка.
   *
   * Через POST с CSRF, а не ссылкой: выгрузка журнала — чтение персональных
   * данных, и по GET-ссылке её можно было бы унести из письма в сообщение.
   */
  const download = useCallback(async () => {
    setError(null)
    setNotice(null)

    const to = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60_000)

    const response = await fetch('/api/dashboard/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-company-id': companyId, 'x-csrf-token': readCsrf() },
      body: JSON.stringify({ from: from.toISOString(), to: to.toISOString(), group: group || null }),
    })

    if (!response.ok) {
      setError('Не удалось выгрузить журнал')
      return
    }

    const payload = (await response.json()) as { csv: string; rows: number; truncated: boolean }

    // BOM добавляется здесь: без него Excel открывает кириллицу в cp1251.
    const blob = new Blob([`﻿${payload.csv}`], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `audit-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)

    setNotice(
      payload.truncated
        ? `Выгружено ${payload.rows} записей — это предел выгрузки. Для полного журнала сузьте период.`
        : `Выгружено записей: ${payload.rows}`,
    )
  }, [companyId, days, group])

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-[13px]">{notice}</div>
      ) : null}

      <Card>
        <CardHeader
          title="Кто и что делал"
          description="Журнал пишется при успешном действии и только в своей транзакции: запись «увидела бы» отвязанный экран, даже если сама отвязка откатилась бы."
          action={
            <div className="flex items-center gap-2">
              {PERIODS.map((period) => (
                <Button
                  key={period.days}
                  size="sm"
                  variant={days === period.days ? 'primary' : 'secondary'}
                  onClick={() => setDays(period.days)}
                >
                  {period.label}
                </Button>
              ))}
              <Button size="sm" disabled={busy} onClick={() => void download()}>
                CSV
              </Button>
            </div>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(data?.groups ?? []).map((entry) => (
              <button
                key={entry.prefix || 'all'}
                onClick={() => setGroup(entry.prefix)}
                className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
                  group === entry.prefix ? 'bg-primary text-primary-text' : 'bg-surface-2 text-text-muted hover:bg-surface-3'
                }`}
              >
                {entry.label}
              </button>
            ))}

            <select
              value={actorUserId}
              onChange={(event) => setActorUserId(event.target.value)}
              className="h-8 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[12px] text-text"
            >
              <option value="">Все сотрудники</option>
              {(data?.actors ?? [])
                .filter((actor) => actor.actorUserId !== null)
                .map((actor) => (
                  <option key={actor.actorUserId!} value={actor.actorUserId!}>
                    {actor.actorName}
                  </option>
                ))}
            </select>
          </div>

          {data && data.byActor.length > 0 ? (
            <div className="flex flex-col gap-1">
              {data.byActor.slice(0, 6).map((actor) => (
                <div key={actor.actorUserId ?? 'system'} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-text">{actor.actorName}</span>
                  <span className="tnum text-text-muted">
                    {actor.actions} {actor.actions === 1 ? 'действие' : 'действий'} ·{' '}
                    {formatTime(actor.lastActionAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {data && data.rows.length === 0 ? (
            <p className="text-[13px] text-text-subtle">
              За выбранный период записей нет. Это нормально: журнал пишется на осмысленные действия, а не на каждый
              клик.
            </p>
          ) : (
            <div className="@container w-full overflow-x-auto">
            <table className="stack-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="w-32 py-2 font-normal">Когда</th>
                  <th className="py-2 font-normal">Кто</th>
                  <th className="py-2 font-normal">Действие</th>
                  <th className="py-2 font-normal">Подробности</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td data-primary className="py-2 text-text-subtle">{formatTime(row.at)}</td>
                    <td data-label="Кто" className="py-2">{row.actorName ?? 'Система'}</td>
                    <td data-label="Действие" className="py-2 font-medium">{row.actionLabel}</td>
                    <td data-label="Подробности" className="py-2 text-text-muted">{describe(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {data && data.total > data.rows.length ? (
            <p className="text-[12px] text-text-subtle">
              Показаны первые {data.rows.length} из {data.total}. Для полного журнала сузьте период или фильтры.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}