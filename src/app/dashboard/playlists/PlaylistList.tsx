'use client'

import { Notice } from '@/components/ui/status-badge'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { FormError, FormField, FormSuccess } from '@/components/ui/form'
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
  fileName: string | null
  mime: string
  width: number | null
  height: number | null
  durationMs: number | null
  hasPoster: boolean
  posterSha256: string | null
  state: string
}

type PlaylistItem = {
  id: string
  position: number
  kind: 'image' | 'video'
  assetId: string
  fileName: string | null
  mime: string
  bytes: number
  durationMs: number | null
  assetDurationMs: number | null
  state: string
  hasPoster: boolean
  posterSha256: string | null
}

type Detail = {
  id: string
  name: string
  state: 'draft' | 'published'
  version: number | null
  cycleDurationMs: number
  assigned: boolean
  items: PlaylistItem[]
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

/**
 * Список плейлистов и состав выбранного.
 *
 * Элементы показываются именами файлов, а не MIME-типом: оператор ищет
 * «баннер_октябрь.jpg», а не «JPEG». Обложка строится по идентификатору
 * медиафайла — раньше здесь передавался идентификатор элемента плейлиста, и
 * изображения не находились вовсе.
 */
export function PlaylistList(props: {
  companyId: string
  canWrite: boolean
  /** Загрузка файлов — отдельное право: `media:write`. */
  canUpload: boolean
  defaultImageDurationMs: number
  initialPlaylists: PlaylistSummaryItem[]
  availableAssets: AssetOption[]
}) {
  const [playlists, setPlaylists] = useState(props.initialPlaylists)
  const [assets, setAssets] = useState(props.availableAssets)
  const [selectedId, setSelectedId] = useState<string | null>(props.initialPlaylists[0]?.id ?? null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [showPicker, setShowPicker] = useState(false)
  const [defaultDuration, setDefaultDuration] = useState(props.defaultImageDurationMs)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [uploading, setUploading] = useState(0)

  const selected = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedId) ?? null,
    [playlists, selectedId],
  )

  const refreshList = useCallback(async () => {
    const response = await fetch('/api/dashboard/playlists', {
      headers: { 'x-company-id': props.companyId },
    })
    if (!response.ok) return
    const data = (await response.json()) as { playlists: PlaylistSummaryItem[] }
    setPlaylists(data.playlists)
  }, [props.companyId])

  const refreshAssets = useCallback(async () => {
    const response = await fetch('/api/dashboard/media', {
      headers: { 'x-company-id': props.companyId },
    })
    if (!response.ok) return
    const data = (await response.json()) as { assets: AssetOption[] }
    setAssets(
      data.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        fileName: asset.fileName,
        mime: asset.mime,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        hasPoster: asset.hasPoster,
        posterSha256: asset.posterSha256 ?? null,
        state: asset.state,
      })),
    )
  }, [props.companyId])

  const loadDetail = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/dashboard/playlists/${id}`, {
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

  const createPlaylist = useCallback(
    async (name: string) => {
      const result = await call('/api/dashboard/playlists', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })

      await refreshList()

      if (result && typeof result.id === 'string') {
        setSelectedId(result.id)
        setNotice(`Плейлист «${name}» создан. Добавьте в него файлы.`)
        return true
      }

      return false
    },
    [call, refreshList],
  )

  const rename = useCallback(
    async (name: string) => {
      if (!selectedId) return false

      const result = await call(`/api/dashboard/playlists/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })

      if (!result) return false

      await refreshList()
      await loadDetail(selectedId)
      setNotice('Название изменено.')
      return true
    },
    [call, loadDetail, refreshList, selectedId],
  )

  const duplicate = useCallback(async () => {
    if (!selectedId) return

    const result = await call(`/api/dashboard/playlists/${selectedId}`, { method: 'POST' })

    await refreshList()

    if (result && typeof result.id === 'string') {
      setSelectedId(result.id)
      setNotice('Копия создана как отдельный плейлист: назначения на экранах у копии свои.')
    }
  }, [call, refreshList, selectedId])

  const remove = useCallback(async () => {
    if (!selectedId) return

    const result = await call(`/api/dashboard/playlists/${selectedId}`, { method: 'DELETE' })

    if (!result) return

    setDeleteOpen(false)
    setDetail(null)
    setSelectedId(null)
    await refreshList()
    setNotice('Плейлист удалён.')
  }, [call, refreshList, selectedId])

  /**
   * Ожидание готовности загруженных файлов.
   *
   * Обработка идёт на сервере и занимает секунды. Добавить файл, пока он ещё
   * обрабатывается, нельзя — он был бы молча пропущен, поэтому ждём готовности
   * здесь, а не показываем «файл не добавлен» без объяснения.
   */
  const waitForReady = useCallback(
    async (assetIds: string[]): Promise<string[]> => {
      const deadline = Date.now() + 120_000
      let ready: string[] = []

      while (Date.now() < deadline) {
        const response = await fetch('/api/dashboard/media', { headers: { 'x-company-id': props.companyId } })
        if (!response.ok) break

        const data = (await response.json()) as { assets: { id: string; state: string }[] }
        const byId = new Map(data.assets.map((asset) => [asset.id, asset.state]))

        ready = assetIds.filter((id) => byId.get(id) === 'ready')
        const failed = assetIds.filter((id) => byId.get(id) === 'failed')

        if (ready.length + failed.length === assetIds.length) break
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      return ready
    },
    [props.companyId],
  )

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

        const added = Number(result.added ?? 0)
        const skipped = Array.isArray(result.skipped) ? result.skipped.length : 0

        if (skipped > 0) {
          setNotice(
            `Добавлено файлов: ${added}. Пропущено: ${skipped} — их обработка ещё не завершена, попробуйте позже.`,
          )
        }
      } else if (result && Array.isArray(result.skipped) && result.skipped.length > 0) {
        setNotice(`Пропущено файлов: ${result.skipped.length} — они ещё обрабатываются`)
      }
    },
    [call, defaultDuration, refreshList, selectedId],
  )

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      setError(null)
      setNotice(null)
      setUploading(files.length)

      const uploaded: string[] = []

      for (const file of files) {
        const body = new FormData()
        body.set('file', file)

        try {
          const response = await fetch('/api/dashboard/media', {
            method: 'POST',
            headers: { 'x-company-id': props.companyId, 'x-csrf-token': readCsrf() },
            body,
          })

          if (!response.ok) {
            const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
            setError(data?.error?.message ?? `Не удалось загрузить ${file.name}`)
            continue
          }

          const data = (await response.json().catch(() => null)) as { assetId?: string } | null
          if (data?.assetId) uploaded.push(data.assetId)
        } catch {
          setError(`Сервер недоступен при загрузке ${file.name}`)
        } finally {
          setUploading((count) => Math.max(0, count - 1))
        }
      }

      await refreshAssets()

      if (uploaded.length === 0) return

      const ready = await waitForReady(uploaded)
      await refreshAssets()

      if (ready.length === 0) {
        setNotice('Файлы загружены, но обработка не завершилась. Добавьте их из медиатеки через минуту.')
        return
      }

      await addAssets(ready)
      setNotice(`Загружено и добавлено файлов: ${ready.length}.`)
    },
    [addAssets, props.companyId, refreshAssets, waitForReady],
  )

  const move = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!selectedId || !detail) return
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= detail.items.length) return

      const ids = detail.items.map((item) => item.id)
      const [moved] = ids.splice(fromIndex, 1)
      if (!moved) return
      ids.splice(toIndex, 0, moved)

      // Оптимистично обновляем: перестановка должна быть мгновенной.
      const reordered = ids.map((id, index) => {
        const found = detail.items.find((item) => item.id === id)
        return found ? { ...found, position: index } : null
      })

      setDetail({
        ...detail,
        items: reordered.filter((item): item is PlaylistItem => item !== null),
      })

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

  const setDuration = useCallback(
    async (itemId: string, seconds: number | null) => {
      if (!selectedId) return

      const result = await call(`/api/dashboard/playlists/${selectedId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ durationMs: seconds === null ? null : Math.round(seconds * 1000) }),
      })

      if (result?.playlist) {
        setDetail(result.playlist as Detail)
        await refreshList()
      }
    },
    [call, refreshList, selectedId],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      if (!selectedId) return

      const result = await call(`/api/dashboard/playlists/${selectedId}/items/${itemId}`, { method: 'DELETE' })

      if (result?.playlist) {
        setDetail(result.playlist as Detail)
        await refreshList()
      }
    },
    [call, refreshList, selectedId],
  )

  const playableAssets = useMemo(
    () => assets.filter((asset) => asset.kind !== 'template'),
    [assets],
  )

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId ?? ''}
          onChange={(event) => setSelectedId(event.target.value || null)}
          aria-label="Плейлист"
          className="field w-72"
        >
          {playlists.length === 0 ? <option value="">Нет плейлистов</option> : null}
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>

        {props.canWrite ? (
          <Button size="md" variant="primary" onClick={() => setCreateOpen(true)}>
            Создать плейлист
          </Button>
        ) : null}

        {detail && props.canWrite ? (
          <>
            <Button size="md" onClick={() => setRenameOpen(true)}>
              Переименовать
            </Button>
            <Button size="md" onClick={() => void duplicate()}>
              Копировать
            </Button>
            <Button size="md" variant="danger" disabled={busy || detail.assigned} onClick={() => setDeleteOpen(true)}>
              Удалить
            </Button>
          </>
        ) : null}
      </div>

      {detail && detail.assigned ? (
        <p className="text-[12.5px] text-text-subtle">
          Плейлист назначен экранам, поэтому удалить его нельзя: сначала снимите назначение в разделе «Расписание».
        </p>
      ) : null}

      {detail ? (
        <>
          <Card>
            <CardHeader
              title={detail.name}
              description={`Цикл ${formatDuration(detail.cycleDurationMs)} · ${detail.items.length} ${plural(
                detail.items.length,
                'материал',
                'материала',
                'материалов',
              )} · изменения сохраняются и применяются на экранах сразу`}
              action={
                props.canWrite ? (
                  <Button size="md" variant="primary" onClick={() => setShowPicker((current) => !current)}>
                    {showPicker ? 'Скрыть медиатеку' : 'Добавить файлы'}
                  </Button>
                ) : null
              }
            />

            <CardBody className="flex flex-col gap-0 p-0">
              {detail.items.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-text-muted">
                  Плейлист пуст. Нажмите «Добавить файлы»: можно выбрать готовые из медиатеки или загрузить
                  новые — они добавятся сразу после обработки.
                </p>
              ) : (
                <ul>
                  <li className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-5 py-2 text-[11.5px] text-text-subtle">
                    <span className="w-6 shrink-0">№</span>
                    <span className="w-16 shrink-0">Кадр</span>
                    <span className="min-w-0 flex-1">Файл</span>
                    <span className="w-24 shrink-0 text-right">Показ</span>
                    <span className="w-[104px] shrink-0 text-right">Порядок</span>
                  </li>

                  {detail.items.map((item, index) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={detail.items.length}
                      companyId={props.companyId}
                      canWrite={props.canWrite}
                      defaultImageMs={props.defaultImageDurationMs}
                      onMove={(to) => void move(index, to)}
                      onDuration={(seconds) => void setDuration(item.id, seconds)}
                      onRemove={() => void removeItem(item.id)}
                    />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {showPicker && props.canWrite ? (
            <Card>
              <CardHeader
                title="Медиатека"
                description="Отметьте готовые файлы или загрузите новые — загруженные добавятся в плейлист автоматически после обработки."
              />
              <CardBody className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[12px] text-text-muted">
                    Показ изображения по умолчанию, с
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
                  uploading={uploading}
                  canUpload={props.canUpload}
                  onUpload={(files) => void upload(files)}
                  onAdd={(ids) => void addAssets(ids)}
                />
              </CardBody>
            </Card>
          ) : null}

        </>
      ) : (
        <Card>
          <CardBody className="py-8 text-center text-[13px] text-text-muted">
            {playlists.length === 0
              ? 'Плейлистов пока нет. Создайте первый — в него можно положить файлы из медиатеки или загрузить новые.'
              : 'Выберите плейлист в списке выше.'}
          </CardBody>
        </Card>
      )}

      <CreatePlaylistModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createPlaylist} />

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Название плейлиста"
        description="Название видно только в панели: на экранах его не показывают."
        size="sm"
        footer={
          <>
            <Button size="md" onClick={() => setRenameOpen(false)}>
              Отмена
            </Button>
            <Button size="md" variant="primary" form="rename-playlist-form" type="submit">
              Сохранить
            </Button>
          </>
        }
      >
        <form
          id="rename-playlist-form"
          onSubmit={(event) => {
            event.preventDefault()
            const value = new FormData(event.currentTarget).get('name')
            const name = typeof value === 'string' ? value.trim() : ''
            if (name.length === 0) return
            void rename(name).then((ok) => {
              if (ok) setRenameOpen(false)
            })
          }}
        >
          <FormField label="Название" name="name" defaultValue={detail?.name ?? ''} required autoFocus maxLength={120} />
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Удалить плейлист?"
        description={`«${detail?.name ?? ''}» будет удалён вместе с составом. Экраны, где он назначен, освободятся автоматически.`}
        size="sm"
        footer={
          <>
            <Button size="md" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button size="md" variant="danger" disabled={busy} onClick={() => void remove()}>
              Удалить
            </Button>
          </>
        }
      />

    </div>
  )
}

function CreatePlaylistModal(props: {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (props.open) {
      setName('')
      setPending(false)
    }
  }, [props.open])

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Новый плейлист"
      description="Плейлист — это порядок и длительность показа. Изменения применяются на экранах сразу."
      size="sm"
      footer={
        <>
          <Button size="md" onClick={props.onClose}>
            Отмена
          </Button>
          <Button
            size="md"
            variant="primary"
            disabled={pending || name.trim().length === 0}
            onClick={() => {
              setPending(true)
              void props.onCreate(name.trim()).then((ok) => {
                setPending(false)
                if (ok) props.onClose()
              })
            }}
          >
            Создать
          </Button>
        </>
      }
    >
      <FormField
        label="Название"
        name="playlist-name"
        value={name}
        onValueChange={setName}
        placeholder="Например, «Витрина — основная»"
        required
        autoFocus
        maxLength={120}
        description="Например, по площадке или по задаче: «Витрина», «Акция — март»."
      />
    </Modal>
  )
}

function ItemRow(props: {
  item: PlaylistItem
  index: number
  total: number
  companyId: string
  canWrite: boolean
  defaultImageMs: number
  onMove: (toIndex: number) => void
  onDuration: (seconds: number | null) => void
  onRemove: () => void
}) {
  const { item, index, total, defaultImageMs } = props

  const autoMs = item.kind === 'video' ? (item.assetDurationMs ?? null) : defaultImageMs
  const [seconds, setSeconds] = useState(item.durationMs ? String(Math.round(item.durationMs / 1000)) : '')

  useEffect(() => {
    setSeconds(item.durationMs ? String(Math.round(item.durationMs / 1000)) : '')
  }, [item.durationMs, item.id])

  function commit() {
    const trimmed = seconds.trim()

    if (trimmed.length === 0) {
      if (item.durationMs !== null) props.onDuration(null)
      return
    }

    const value = Number(trimmed)
    if (!Number.isFinite(value) || value < 0) {
      setSeconds(item.durationMs ? String(Math.round(item.durationMs / 1000)) : '')
      return
    }

    if (Math.round(value * 1000) === item.durationMs) return
    props.onDuration(value)
  }

  return (
    <li
      draggable={props.canWrite}
      onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const from = Number(event.dataTransfer.getData('text/plain'))
        if (Number.isInteger(from)) props.onMove(from)
      }}
      className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-0"
    >
      <span className="tnum w-6 shrink-0 cursor-grab text-[12px] text-text-subtle" title="Перетащите, чтобы изменить порядок">
        {index + 1}
      </span>

      {item.hasPoster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/dashboard/media/file?companyId=${props.companyId}&assetId=${item.assetId}&variant=poster&v=${encodeURIComponent(item.posterSha256 ?? item.id)}`}
          alt=""
          className="h-9 w-16 shrink-0 rounded-[var(--radius-sm)] bg-surface-2 object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-2 text-[10px] text-text-subtle">
          {item.kind === 'video' ? '▶ видео' : 'изображение'}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]" title={item.fileName ?? item.mime}>
          {item.fileName ?? item.mime.replace(/^(image|video)\//, '').toUpperCase()}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-text-subtle">
          {item.kind === 'video' ? 'Видео' : 'Изображение'}
          {item.assetDurationMs ? ` · файл ${formatDuration(item.assetDurationMs)}` : ''}
          {` · ${formatBytes(item.bytes)}`}
          {item.state !== 'ready' ? ' · обрабатывается' : ''}
        </span>
      </span>

      {item.kind === 'video' ? (
        // У видео нет «показ, сек»: ролик всегда играет до конца. Поле здесь
        // только путало бы и позволяло обрезать рекламу на середине.
        <span className="w-24 shrink-0 text-right text-[12px] text-text-subtle">до конца</span>
      ) : props.canWrite ? (
        <input
          type="number"
          min={0}
          max={3600}
          value={seconds}
          placeholder={autoMs ? String(Math.round(autoMs / 1000)) : 'авто'}
          onChange={(event) => setSeconds(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          aria-label="Длительность показа в секундах"
          className="h-8 w-24 shrink-0 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-right text-[12px] tnum"
        />
      ) : (
        <span className="tnum w-24 shrink-0 text-right text-[12px] text-text-subtle">
          {formatDuration(item.durationMs ?? autoMs ?? 0)}
        </span>
      )}

      <span className="flex w-[104px] shrink-0 items-center justify-end gap-1">
        <button
          type="button"
          disabled={!props.canWrite || index === 0}
          onClick={() => props.onMove(index - 1)}
          className="px-1.5 text-[13px] text-text-subtle disabled:opacity-30 hover:text-text"
          aria-label="Переместить выше"
          title="Выше"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={!props.canWrite || index === total - 1}
          onClick={() => props.onMove(index + 1)}
          className="px-1.5 text-[13px] text-text-subtle disabled:opacity-30 hover:text-text"
          aria-label="Переместить ниже"
          title="Ниже"
        >
          ↓
        </button>
        <button
          type="button"
          disabled={!props.canWrite}
          onClick={props.onRemove}
          className="px-1.5 text-[13px] text-text-subtle disabled:opacity-30 hover:text-danger"
          aria-label="Убрать из плейлиста"
          title="Убрать"
        >
          ✕
        </button>
      </span>
    </li>
  )
}

/**
 * Выбор файлов.
 *
 * Два пути в одном месте: готовые файлы отмечаются галочками, новые
 * загружаются файловым диалогом или перетаскиванием. Разносить их по разным
 * экранам значило бы заставить оператора угадывать, где искать нужное.
 */
function AssetPicker(props: {
  assets: AssetOption[]
  companyId: string
  uploading: number
  canUpload: boolean
  onUpload: (files: File[]) => void
  onAdd: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return props.assets

    return props.assets.filter((asset) =>
      `${asset.fileName ?? ''} ${asset.mime} ${asset.width ?? ''}x${asset.height ?? ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [props.assets, search])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragActive(false)
        const files = Array.from(event.dataTransfer.files)
        if (files.length > 0) props.onUpload(files)
      }}
      className={`flex flex-col gap-3 rounded-[var(--radius-lg)] border border-dashed p-3 transition-colors ${
        dragActive ? 'border-primary bg-primary-soft/40' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по имени файла"
          aria-label="Поиск по медиатеке"
          className="field h-9 max-w-64 flex-1"
        />

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length > 0) props.onUpload(files)
            event.target.value = ''
          }}
        />

        {props.canUpload ? (
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={props.uploading > 0}>
            {props.uploading > 0 ? `Загружаем… ${props.uploading}` : 'Загрузить файлы'}
          </Button>
        ) : null}

        <Button
          size="sm"
          variant="primary"
          disabled={selected.size === 0}
          onClick={() => {
            props.onAdd([...selected])
            setSelected(new Set())
          }}
        >
          Добавить выбранные ({selected.size})
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-[13px] text-text-muted">
          {props.assets.length === 0
            ? 'В медиатеке пока нет готовых файлов. Загрузите их здесь — они попадут и в медиатеку, и в плейлист.'
            : 'По этому запросу ничего не нашлось.'}
        </p>
      ) : (
        <div className="flex max-h-[320px] flex-wrap gap-2 overflow-y-auto">
          {visible.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => toggle(asset.id)}
              title={asset.fileName ?? asset.mime}
              className={`relative h-[72px] w-[92px] shrink-0 overflow-hidden rounded-[var(--radius-md)] border-2 ${
                selected.has(asset.id) ? 'border-primary' : 'border-transparent'
              }`}
            >
              {asset.hasPoster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/dashboard/media/file?companyId=${props.companyId}&assetId=${asset.id}&variant=poster&v=${encodeURIComponent(asset.posterSha256 ?? asset.id)}`}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex size-full items-center justify-center bg-surface-2 text-[10px] text-text-subtle">
                  {asset.kind === 'video' ? '▶ видео' : 'изображение'}
                </span>
              )}

              <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[10px] text-white">
                {asset.fileName ?? asset.mime}
              </span>
            </button>
          ))}
        </div>
      )}

      {props.uploading > 0 ? <Notice>Файлы загружаются и обрабатываются. Это может занять до минуты.</Notice> : null}
    </div>
  )
}
