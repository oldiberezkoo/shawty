'use client'

import { Notice } from '@/components/ui/status-badge'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { CSRF_COOKIE } from '@/lib/cookie-names'

export type DeliverySummaryView = {
  sent: number
  applied: number
  downloading: number
  noContact: number
  total: number
  failed?: number
}

export type ReceiptView = {
  screenId: string
  screenName: string
  state: string
  ackedAt: string | null
  errorCode?: string | null
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
  versions: { id: string; version: number }[]
}

/** Как часто доска опрашивает сервер за живыми числами доставки. */
const REFRESH_MS = 3000

/** Понятная подпись состояния чека вместо английского слова из базы. */
const STATE_LABEL: Record<string, string> = {
  queued: 'в очереди',
  sent: 'отправлено, ждёт подтверждения',
  downloading: 'загружает',
  applied: 'применил',
  failed: 'отказ',
  stale: 'устарело',
}

/** Цвет состояния: «применил» — единственное, что выглядит как результат. */
const STATE_TONE: Record<string, string> = {
  applied: 'text-success',
  failed: 'text-danger',
  downloading: 'text-info',
  queued: 'text-text-muted',
  sent: 'text-text-muted',
  stale: 'text-warn',
}

function relativeTime(value: string | null): string {
  if (!value) return '—'

  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return `${seconds} сек назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/**
 * Четыре числа доставки и разбор по каждому экрану.
 *
 * Это главный экран продукта. Важно, что они считаются, а не рисуются:
 * «применили» означает подтверждение плеера, «нет связи» — heartbeat старше
 * порога экрана. Числа обновляются опросом сервера, а не пересчётом на
 * клиенте: после публикации экран применяет манифест через несколько секунд,
 * и именно это изменение оператор обязан увидеть без перезагрузки страницы.
 */
export function DeliveryBoard(props: {
  companyId: string
  canPublish: boolean
  summary: DeliverySummaryView
  receipts: ReceiptView[]
  latestRelease: { version: number; createdAt: string; itemCount: number } | null
  assignments: AssignmentView[]
  branches: { id: string; name: string }[]
  groups: { id: string; name: string }[]
  playlistVersions: PlaylistVersionView[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [summary, setSummary] = useState(props.summary)
  const [receipts, setReceipts] = useState(props.receipts)

  const [scopeType, setScopeType] = useState<'company' | 'branch' | 'group'>('company')
  const [scopeId, setScopeId] = useState('')
  const [versionId, setVersionId] = useState('')

  // Пропсы нужны только для первичного значения: дальше числа приходят
  // с сервера, и пересоздание компонента не должно затирать живые данные.
  const initialSummary = useRef(props.summary)
  const initialReceipts = useRef(props.receipts)

  useEffect(() => {
    setSummary(initialSummary.current)
    setReceipts(initialReceipts.current)
  }, [])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // Один таймер без слушателя видимости: браузер сам притормаживает
    // таймеры в скрытой вкладке, а два конкурирующих опроса дали бы
    // дублирующие ответы и гонку за состояние.
    const refresh = async () => {
      try {
        const response = await fetch('/api/dashboard/releases', {
          headers: { 'x-company-id': props.companyId },
          cache: 'no-store',
        })

        if (response.ok) {
          const data = (await response.json()) as { summary?: DeliverySummaryView; receipts?: ReceiptView[] }
          if (!stopped && data.summary) setSummary(data.summary)
          if (!stopped && data.receipts) setReceipts(data.receipts)
        }
      } catch {
        // Молча переживаем обрыв: следующий тик попробует снова. Показывать
        // ошибку опроса было бы шумом — числа просто останутся прежними.
      } finally {
        if (!stopped) timer = setTimeout(refresh, REFRESH_MS)
      }
    }

    timer = setTimeout(refresh, REFRESH_MS)

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [props.companyId])

  const versionOptions = props.playlistVersions.flatMap((playlist) =>
    playlist.versions.map(() => ({
      id: playlist.versions[0]?.id ?? '',
      label: playlist.name,
    })).filter((option) => option.id.length > 0),
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
      setError('Выберите область и плейлист')
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

      // Числа после публикации ещё неполны: экран применяет манифест через
      // несколько секунд. Поэтому сообщение фиксирует факт публикации и
      // отсылает к живым числам, а не выдумывает «доставлено N».
      setNotice(
        summary
          ? `Публикация №${result.version} для ${summary.total} экранов. ` +
              `Отправлено ${summary.sent}, применяют ${summary.applied}. ` +
              `Точные числа обновятся на этой странице автоматически.`
          : `Публикация №${result.version}`,
      )
    }
  }, [call])

  const failed = summary.failed ?? 0

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : null}
      {notice ? (
        <Notice>{notice}</Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <NumberTile label="Отправлено" value={summary.sent} tone="default" />
        <NumberTile label="Применили" value={summary.applied} tone="success" />
        <NumberTile label="Загружают" value={summary.downloading} tone="info" />
        <NumberTile label="Нет связи" value={summary.noContact} tone={summary.noContact > 0 ? 'warn' : 'default'} />
      </div>

      {failed > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {failed} {failed === 1 ? 'экран не смог' : 'экрана не смогли'} применить публикацию. Такие чеки
          помечены «отказ» в таблице ниже — их придётся разобрать вручную: повторная отправка прекращена.
        </div>
      ) : null}

      {props.canPublish ? (
        <Card>
          <CardHeader
            title="Назначение и публикация"
            description="Сначала назначьте плейлист области экранов, затем опубликуйте: назначение само по себе экран не меняет."
          />
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
                Область
                <select
                  value={scopeType}
                  onChange={(event) => {
                    setScopeType(event.target.value as 'company' | 'branch' | 'group')
                    setScopeId('')
                  }}
                  className="field w-40"
                >
                  <option value="company">Вся компания</option>
                  <option value="branch">Филиал</option>
                  <option value="group">Группа экранов</option>
                </select>
              </label>

              {scopeType !== 'company' ? (
                <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
                  {scopeType === 'branch' ? 'Филиал' : 'Группа'}
                  <select
                    value={scopeId}
                    onChange={(event) => setScopeId(event.target.value)}
                    className="field w-56"
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

              <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
                Плейлист
                <select
                  value={versionId}
                  onChange={(event) => setVersionId(event.target.value)}
                  className="field w-64"
                >
                  <option value="">Выберите</option>
                  {versionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button size="md" disabled={busy} onClick={() => void assign()}>
                Назначить
              </Button>

              <Button size="md" variant="primary" disabled={busy} onClick={() => void publish()}>
                Опубликовать на сеть
              </Button>
            </div>

            {versionOptions.length === 0 ? (
              <p className="text-[12px] text-text-subtle">
                Нет плейлистов. Сначала соберите плейлист в разделе «Плейлисты».
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

      {props.latestRelease && receipts.length > 0 ? (
        <Card>
          <CardHeader
            title={`Публикация №${props.latestRelease.version}`}
            description={`${relativeTime(props.latestRelease.createdAt)} · ${
              props.latestRelease.itemCount
            } материалов · ${receipts.length} экранов`}
          />
          <CardBody className="p-0">
            <div className="@container w-full overflow-x-auto">
            <table className="stack-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="px-5 py-2 font-normal">Экран</th>
                  <th className="px-5 py-2 font-normal">Состояние доставки</th>
                  <th className="px-5 py-2 text-right font-normal">Подтверждено</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.screenId} className="border-b border-border last:border-0">
                    <td data-primary className="px-5 py-2">
                      <Link
                        href="/dashboard/screens"
                        className="font-medium hover:underline underline-offset-4"
                      >
                        {receipt.screenName}
                      </Link>
                    </td>
                    <td data-label="Состояние доставки" className={`px-5 py-2 ${STATE_TONE[receipt.state] ?? 'text-text-muted'}`}>
                      {STATE_LABEL[receipt.state] ?? receipt.state}
                      {receipt.errorCode ? (
                        <span className="ml-2 text-[12px] text-text-subtle">{receipt.errorCode}</span>
                      ) : null}
                    </td>
                    <td data-label="Подтверждено" className="px-5 py-2 text-right text-text-muted">{relativeTime(receipt.ackedAt)}</td>
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
