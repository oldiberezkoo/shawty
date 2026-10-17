'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { CSRF_COOKIE } from '@/lib/cookie-names'

export type DeliverySummaryView = {
  sent: number
  applied: number
  downloading: number
  noContact: number
  total: number
}

export type AssignmentView = {
  id: string
  scopeType: 'screen' | 'group' | 'branch' | 'company'
  scopeId: string
  playlistVersionId: string
}

export type PlaylistVersionView = {
  playlistId: string
  name: string
  version: number | null
  versions: { id: string; version: number; items: number }[]
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/**
 * Четыре числа доставки.
 *
 * Это главный экран продукта. Важно, что они считаются, а не рисуются:
 * «применили» означает подтверждение плеера плюс факт переключения,
 * «нет связи» — heartbeat старше порога экрана.
 */
export function DeliveryBoard(props: {
  companyId: string
  canPublish: boolean
  summary: DeliverySummaryView
  releases: { id: string; version: number; createdAt: string; itemCount: number }[]
  latestReceipts: { screenId: string; screenName: string; state: string; ackedAt: string | null }[]
  assignments: AssignmentView[]
  branches: { id: string; name: string }[]
  groups: { id: string; name: string }[]
  playlistVersions: PlaylistVersionView[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [scopeType, setScopeType] = useState<'company' | 'branch' | 'group'>('company')
  const [scopeId, setScopeId] = useState('')
  const [versionId, setVersionId] = useState('')

  const versionOptions = props.playlistVersions.flatMap((playlist) =>
    playlist.versions.map((entry) => ({
      id: entry.id,
      label: `${playlist.name} · версия ${entry.version}`,
    })),
  )

  const call = useCallback(
    async (path: string, init: RequestInit) => {
      setError(null)
      setNotice(null)
      setBusy(true)

      const response = await fetch(path, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-company-id': props.companyId,
          'x-csrf-token': readCsrf(),
          ...(init.headers ?? {}),
        },
      })

      setBusy(false)

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(data?.error?.message ?? 'Не удалось выполнить действие')
        return null
      }

      return (await response.json().catch(() => null)) as Record<string, unknown> | null
    },
    [props.companyId],
  )

  const assign = useCallback(async () => {
    const targetId = scopeType === 'company' ? props.companyId : scopeId
    if (!targetId || !versionId) {
      setError('Выберите область и версию плейлиста')
      return
    }

    await call('/api/dashboard/releases', {
      method: 'PUT',
      body: JSON.stringify({ scopeType, scopeId: targetId, playlistVersionId: versionId }),
    })
  }, [call, props.companyId, scopeId, scopeType, versionId])

  const publish = useCallback(async () => {
    const result = await call('/api/dashboard/releases', {
      method: 'POST',
      body: JSON.stringify({ reason: null }),
    })

    if (result) {
      const summary = result.summary as DeliverySummaryView | undefined
      const delivered = Number(result.delivered ?? 0)

      setNotice(
        summary
          ? `Опубликована версия ${result.version}. Отправлено ${delivered} из ${result.screens}. ` +
              `Применили: ${summary.applied}, грузят: ${summary.downloading}, нет связи: ${summary.noContact}`
          : `Опубликована версия ${result.version}`,
      )

      // Сводку обновляем перезагрузкой страницы: честные числа должны
      // прийти с сервера, а не быть пересчитанными на клиенте.
      window.location.reload()
    }
  }, [call])

  const { summary } = props

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-[13px]">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <NumberTile label="Отправлено" value={summary.sent} tone="default" />
        <NumberTile label="Применили" value={summary.applied} tone="success" />
        <NumberTile label="Загружают" value={summary.downloading} tone="info" />
        <NumberTile label="Нет связи" value={summary.noContact} tone={summary.noContact > 0 ? 'warn' : 'default'} />
      </div>

      {props.canPublish ? (
        <Card>
          <CardHeader
            title="Назначение и публикация"
            description="Сначала назначьте плейлист области экранов, затем опубликуйте: назначение само по себе экран не меняет."
          />
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
                Область
                <select
                  value={scopeType}
                  onChange={(event) => {
                    setScopeType(event.target.value as 'company' | 'branch' | 'group')
                    setScopeId('')
                  }}
                  className="h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
                >
                  <option value="company">Вся компания</option>
                  <option value="branch">Филиал</option>
                  <option value="group">Группа экранов</option>
                </select>
              </label>

              {scopeType !== 'company' ? (
                <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
                  {scopeType === 'branch' ? 'Филиал' : 'Группа'}
                  <select
                    value={scopeId}
                    onChange={(event) => setScopeId(event.target.value)}
                    className="h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
                  >
                    <option value="">Выберите</option>
                    {(scopeType === 'branch' ? props.branches : props.groups).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
                Версия плейлиста
                <select
                  value={versionId}
                  onChange={(event) => setVersionId(event.target.value)}
                  className="h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
                >
                  <option value="">Выберите</option>
                  {versionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button size="sm" disabled={busy} onClick={() => void assign()}>
                Назначить
              </Button>

              <Button size="sm" variant="primary" disabled={busy} onClick={() => void publish()}>
                Опубликовать на сеть
              </Button>
            </div>

            {versionOptions.length === 0 ? (
              <p className="text-[12px] text-text-subtle">
                Нет зафиксированных версий. Сначала соберите плейлист и нажмите «Зафиксировать версию».
              </p>
            ) : null}

            {props.assignments.length > 0 ? (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="text-[12px] text-text-subtle">Текущие назначения</span>
                {props.assignments.map((assignment) => (
                  <div key={assignment.id} className="flex items-center gap-2 text-[12px] text-text-muted">
                    <span className="rounded bg-surface-3 px-1.5 py-0.5">{assignment.scopeType}</span>
                    <span>{scopeName(assignment, props)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}

function scopeName(
  assignment: AssignmentView,
  props: { branches: { id: string; name: string }[]; groups: { id: string; name: string }[] },
): string {
  if (assignment.scopeType === 'company') return 'Вся компания'
  const list = assignment.scopeType === 'branch' ? props.branches : props.groups
  return list.find((option) => option.id === assignment.scopeId)?.name ?? assignment.scopeId
}

function NumberTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneClass: Record<string, string> = {
    default: 'text-text',
    success: 'text-success',
    warn: 'text-warn',
    info: 'text-info',
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-[12px] text-text-muted">{label}</span>
        <span className={`tnum text-3xl font-semibold tracking-[-0.02em] ${toneClass[tone] ?? ''}`}>{value}</span>
      </CardBody>
    </Card>
  )
}
