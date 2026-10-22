'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Notice } from '@/components/ui/status-badge'
import { dashboardRequest } from '@/shared/api/dashboard-client'
import { RELEASES_PATH } from '@/shared/api/releases'
import { fetchDeliverySnapshot } from '../api'
import type {
  AssignmentView,
  DeliverySummaryView,
  PlaylistVersionView,
  ReceiptView,
  ScopeOption,
} from '../model'
import { AssignmentPanel } from './AssignmentPanel'
import { DeliveryStats } from './DeliveryStats'
import { ReceiptsTable } from './ReceiptsTable'

/** Как часто доска опрашивает сервер за живыми числами доставки. */
const REFRESH_MS = 3000

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
  branches: ScopeOption[]
  groups: ScopeOption[]
  playlistVersions: PlaylistVersionView[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [summary, setSummary] = useState(props.summary)
  const [receipts, setReceipts] = useState(props.receipts)

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
      const data = await fetchDeliverySnapshot(props.companyId)

      if (!stopped && data?.summary) setSummary(data.summary)
      if (!stopped && data?.receipts) setReceipts(data.receipts)

      if (!stopped) timer = setTimeout(refresh, REFRESH_MS)
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

      const result = await dashboardRequest<Record<string, unknown>>(path, init, props.companyId)

      setBusy(false)

      if (!result.ok) {
        setError(result.message)
        return null
      }

      return result.data
    },
    [props.companyId],
  )

  const assign = useCallback(
    async (scopeType: 'company' | 'branch' | 'group', scopeId: string, versionId: string) => {
      const targetId = scopeType === 'company' ? props.companyId : scopeId
      if (!targetId || !versionId) {
        setError('Выберите область и плейлист')
        return
      }

      await call(RELEASES_PATH, {
        method: 'PUT',
        body: JSON.stringify({ scopeType, scopeId: targetId, playlistVersionId: versionId }),
      })
    },
    [call, props.companyId],
  )

  const publish = useCallback(async () => {
    const result = await call(RELEASES_PATH, {
      method: 'POST',
      body: JSON.stringify({ reason: null }),
    })

    if (result) {
      const published = result.summary as DeliverySummaryView | undefined

      // Числа после публикации ещё неполны: экран применяет манифест через
      // несколько секунд. Поэтому сообщение фиксирует факт публикации и
      // отсылает к живым числам, а не выдумывает «доставлено N».
      setNotice(
        published
          ? `Публикация №${result.version} для ${published.total} экранов. ` +
              `Отправлено ${published.sent}, применяют ${published.applied}. ` +
              `Точные числа обновятся на этой странице автоматически.`
          : `Публикация №${result.version}`,
      )
    }
  }, [call])

  return (
    <div className="flex flex-col gap-6">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <DeliveryStats summary={summary} />

      {props.canPublish ? (
        <AssignmentPanel
          versionOptions={versionOptions}
          assignments={props.assignments}
          branches={props.branches}
          groups={props.groups}
          busy={busy}
          onAssign={(scopeType, scopeId, versionId) => void assign(scopeType, scopeId, versionId)}
          onPublish={() => void publish()}
        />
      ) : null}

      <ReceiptsTable latestRelease={props.latestRelease} receipts={receipts} />
    </div>
  )
}
