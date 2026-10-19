'use client'

import { Notice } from '@/components/ui/status-badge'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { CSRF_COOKIE } from '@/lib/cookie-names'
import { formatDuration } from '@/domain/playlist/rules'

export type PlaylistSummaryItem = {
  id: string
  name: string
  state: 'draft' | 'published'
  version: number | null
  items: number
  cycleDurationMs: number
  assigned: boolean
}

export type AssetOption = {
  id: string
  kind: 'image' | 'video' | 'template'
  mime: string
  width: number | null
  height: number | null
  durationMs: number | null
  hasPoster: boolean
}

type Detail = {
  id: string
  name: string
  state: 'draft' | 'published'
  cycleDurationMs: number
  items: {
    id: string
    position: number
    kind: 'image' | 'video'
    mime: string
    durationMs: number | null
    state: string
    hasPoster: boolean
  }[]
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/** Длительность показа элемента, как её увидит телевизор. */
function itemDurationMs(item: Detail['items'][number], defaultImageMs = 8000): number {
  if (item.durationMs && item.durationMs > 0) return item.durationMs
  if (item.kind === 'video') return item.durationMs && item.durationMs > 0 ? item.durationMs : 1000
  return defaultImageMs
}

export function PlaylistList(props: {
  companyId: string
  canWrite: boolean
  canPublish: boolean
  initialPlaylists: PlaylistSummaryItem[]
  availableAssets: AssetOption[]
}) {
  const [playlists, setPlaylists] = useState(props.initialPlaylists)
  const [selectedId, setSelectedId] = useState<string | null>(props.initialPlaylists[0]?.id ?? null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [showAssets, setShowAssets] = useState(false)
  const [defaultDuration, setDefaultDuration] = useState(8000)

  const refreshList = useCallback(async () => {
    const response = await fetch(`/api/dashboard/playlists?companyId=${props.companyId}`, {
      headers: { 'x-company-id': props.companyId },
    })
    if (!response.ok) return
    const data = (await response.json()) as { playlists: PlaylistSummaryItem[] }
    setPlaylists(data.playlists)
  }, [props.companyId])

  const loadDetail = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/dashboard/playlists/${id}?companyId=${props.companyId}`, {
        headers: { 'x-company-id': props.companyId },
      })
      if (!response.ok) return
      const data = (await response.json()) as { playlist: Detail }
      setDetail(data.playlist)
    },
    [props.companyId],
  )

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    void loadDetail(selectedId)
  }, [selectedId, loadDetail])

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

  const create = useCallback(async () => {
    const name = window.prompt('Название плейлиста')
    if (!name) return

    const result = await call('/api/dashboard/playlists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })

    await refreshList()
    if (result && typeof result.id === 'string') setSelectedId(result.id)
  }, [call, refreshList])

  const addAssets = useCallback(
    async (assetIds: string[]) => {
      if (assetIds.length === 0 || !selectedId) return

      const result = await call(`/api/dashboard/playlists/${selectedId}/items`, {
        method: 'POST',
        body: JSON.stringify({ assetIds, durationMs: defaultDuration }),
      })

      if (result?.playlist) {
        setDetail(result.playlist as Detail)
        await refreshList()
      } else if (result && Array.isArray(result.skipped) && result.skipped.length > 0) {
        setNotice(`Пропущено файлов: ${result.skipped.length} — они ещё обрабатываются`)
      }
    },
    [call, refreshList, selectedId, defaultDuration],
  )

  /**
   * Перестановка перетаскиванием.
   *
   * На сервер уходит полный порядок идентификаторов: индексы устаревают
   * между началом перетаскивания и сохранением при любом параллельном
   * изменении, а список идентификаторов остаётся однозначным.
   */
  const move = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!selectedId || !detail) return
      if (fromIndex === toIndex) return

      const ids = detail.items.map((item) => item.id)
      const [moved] = ids.splice(fromIndex, 1)
      if (!moved) return
      ids.splice(toIndex, 0, moved)

      // Оптимистично обновляем: перетаскивание должно быть мгновенным.
      const reordered = ids.map((id, index) => {
        const found = detail.items.find((item) => item.id === id)
        return found ? { ...found, position: index } : null
      })

      const optimistic = {
        ...detail,
        items: reordered.filter((item): item is Detail['items'][number] => item !== null),
      }
      setDetail(optimistic)

      const result = await call(`/api/dashboard/playlists/${selectedId}/items`, {
        method: 'PUT',
        body: JSON.stringify({ orderedItemIds: ids }),
      })

      if (result?.playlist) {
        setDetail(result.playlist as Detail)
        await refreshList()
      } else {
        await loadDetail(selectedId)
      }
    },
    [call, detail, loadDetail, refreshList, selectedId],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      if (!selectedId) return

      const result = await call(
        `/api/dashboard/playlists/${selectedId}/items/${itemId}?companyId=${props.companyId}`,
        { method: 'DELETE' },
      )

      if (result?.playlist) {
        setDetail(result.playlist as Detail)
        await refreshList()
      }
    },
    [call, props.companyId, refreshList, selectedId],
  )

  const publish = useCallback(async () => {
    if (!selectedId) return

    const result = await call(`/api/dashboard/playlists/${selectedId}/publish?companyId=${props.companyId}`, {
      method: 'POST',
      body: '{}',
    })

    if (result) {
      setNotice(`Версия ${result.version} зафиксирована: ${result.itemCount} материалов`)
      await refreshList()
      await loadDetail(selectedId)
    }
  }, [call, loadDetail, props.companyId, refreshList, selectedId])

  const playableAssets = useMemo(
    () => props.availableAssets.filter((asset) => asset.kind !== 'template'),
    [props.availableAssets],
  )

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : null}
      {notice ? (
        <Notice>{notice}</Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedId ?? ''}
          onChange={(event) => setSelectedId(event.target.value || null)}
          className="field w-64"
        >
          {playlists.length === 0 ? <option value="">Нет плейлистов</option> : null}
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
              {playlist.version ? ` · версия ${playlist.version}` : ''}
            </option>
          ))}
        </select>

        {props.canWrite ? (
          <Button size="md" onClick={() => void create()}>
            Создать плейлист
          </Button>
        ) : null}

        {detail && props.canWrite ? (
          <Button size="md" onClick={() => setShowAssets((current) => !current)}>
            {showAssets ? 'Скрыть медиатеку' : 'Добавить файлы'}
          </Button>
        ) : null}

        {detail && props.canPublish ? (
          <Button size="sm" variant="primary" disabled={busy || detail.items.length === 0} onClick={() => void publish()}>
            Зафиксировать версию
          </Button>
        ) : null}
      </div>

      {showAssets && detail ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-text-muted">
                Отметьте файлы и нажмите «Добавить в плейлист». Длительность показа изображения —
                {defaultDuration / 1000} с.
              </span>
              <label className="flex items-center gap-2 text-[12px] text-text-muted">
                Показ, с
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={Math.round(defaultDuration / 1000)}
                  onChange={(event) => setDefaultDuration(Number(event.target.value) * 1000)}
                  className="h-8 w-16 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[12px]"
                />
              </label>
            </div>

            <AssetPicker
              assets={playableAssets}
              companyId={props.companyId}
              onAdd={(ids) => void addAssets(ids)}
            />
          </CardBody>
        </Card>
      ) : null}

      {detail ? (
        <Card>
          <CardBody className="flex flex-col gap-3 p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-[13px] text-text-muted">
                Цикл: <span className="tnum font-medium text-text">{formatDuration(detail.cycleDurationMs)}</span> ·
                материалов: {detail.items.length}
              </span>
              <span className="text-[12px] text-text-subtle">
                {detail.state === 'published' ? 'Опубликована' : 'Черновик — изменения не видны на экранах'}
              </span>
            </div>

            {detail.items.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-text-muted">
                Плейлист пуст. Добавьте файлы из медиатеки.
              </p>
            ) : (
              <ul>
                {detail.items.map((item, index) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={detail.items.length}
                    companyId={props.companyId}
                    onMove={(to) => void move(index, to)}
                    onRemove={() => void removeItem(item.id)}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}

function ItemRow(props: {
  item: Detail['items'][number]
  index: number
  total: number
  companyId: string
  onMove: (toIndex: number) => void
  onRemove: () => void
}) {
  const { item, index, total } = props
  const duration = itemDurationMs(item)

  return (
    <li
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const from = Number(event.dataTransfer.getData('text/plain'))
        if (Number.isInteger(from)) props.onMove(from)
      }}
      className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-0"
    >
      <span className="w-6 shrink-0 cursor-grab text-[12px] tabular-nums text-text-subtle">{index + 1}</span>

      {item.hasPoster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/dashboard/media/file?companyId=${props.companyId}&assetId=${item.id}&variant=poster`}
          alt=""
          className="h-9 w-16 shrink-0 rounded-[var(--radius-sm)] bg-surface-2 object-cover"
          loading="lazy"
        />
      ) : (
        <span className="h-9 w-16 shrink-0 rounded-[var(--radius-sm)] bg-surface-2" />
      )}

      <span className="min-w-0 flex-1 truncate text-[13px]">
        {item.mime.replace(/^(image|video)\//, '').toUpperCase()}
      </span>

      <span className="tnum shrink-0 text-[12px] text-text-subtle">{formatDuration(duration)}</span>

      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => props.onMove(index - 1)}
          className="px-1.5 text-[12px] text-text-subtle disabled:opacity-30 hover:text-text"
          aria-label="Выше"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => props.onMove(index + 1)}
          className="px-1.5 text-[12px] text-text-subtle disabled:opacity-30 hover:text-text"
          aria-label="Ниже"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={props.onRemove}
          className="px-1.5 text-[12px] text-text-subtle hover:text-danger"
          aria-label="Убрать"
        >
          ✕
        </button>
      </span>
    </li>
  )
}

function AssetPicker(props: {
  assets: AssetOption[]
  companyId: string
  onAdd: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (props.assets.length === 0) {
    return <p className="text-[13px] text-text-muted">В медиатеке пока нет готовых файлов.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[320px] flex-wrap gap-2 overflow-y-auto">
        {props.assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={() => toggle(asset.id)}
            title={asset.mime}
            className={`relative size-[72px] overflow-hidden rounded-[var(--radius-md)] border-2 ${
              selected.has(asset.id) ? 'border-text' : 'border-transparent'
            }`}
          >
            {asset.hasPoster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/dashboard/media/file?companyId=${props.companyId}&assetId=${asset.id}&variant=poster`}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="flex size-full items-center justify-center bg-surface-2 text-[10px] text-text-subtle">
                {asset.kind === 'video' ? '▶' : '—'}
              </span>
            )}
          </button>
        ))}
      </div>

      <Button
        size="sm"
        variant="primary"
        disabled={selected.size === 0}
        onClick={() => {
          props.onAdd([...selected])
          setSelected(new Set())
        }}
      >
        Добавить в плейлист ({selected.size})
      </Button>
    </div>
  )
}
