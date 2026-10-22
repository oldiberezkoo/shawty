'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { FormError, FormField, FormSuccess } from '@/components/ui/form'
import { dashboardRequest } from '@/shared/api/dashboard-client'
import { plural } from '@/shared/lib/plural'
import { formatDuration } from '@/domain/playlist/rules'
import {
  fetchPlayableAssets,
  fetchPlaylistDetail,
  fetchPlaylists,
  uploadPlaylistFile,
  waitForReadyAssets,
} from '../api'
import type { AssetOption, PlaylistDetail, PlaylistSummaryItem } from '../model'
import { AssetPicker } from './AssetPicker'
import { CreatePlaylistModal } from './CreatePlaylistModal'
import { PlaylistItemRow } from './PlaylistItemRow'

export type { AssetOption, PlaylistSummaryItem }

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
  const [detail, setDetail] = useState<PlaylistDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [showPicker, setShowPicker] = useState(false)
  const [defaultDuration, setDefaultDuration] = useState(props.defaultImageDurationMs)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [uploading, setUploading] = useState(0)

  const refreshList = useCallback(async () => {
    const next = await fetchPlaylists(props.companyId)
    if (next) setPlaylists(next)
  }, [props.companyId])

  const refreshAssets = useCallback(async () => {
    const next = await fetchPlayableAssets(props.companyId)
    if (next) setAssets(next)
  }, [props.companyId])

  const loadDetail = useCallback(
    async (id: string) => {
      const next = await fetchPlaylistDetail(props.companyId, id)
      if (next) setDetail(next)
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

  const addAssets = useCallback(
    async (assetIds: string[]) => {
      if (assetIds.length === 0 || !selectedId) return

      const result = await call(`/api/dashboard/playlists/${selectedId}/items`, {
        method: 'POST',
        body: JSON.stringify({ assetIds, durationMs: defaultDuration }),
      })

      if (result?.playlist) {
        setDetail(result.playlist as PlaylistDetail)
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
        try {
          const result = await uploadPlaylistFile(props.companyId, file)

          if (result.kind === 'ok') {
            if (result.assetId) uploaded.push(result.assetId)
          } else {
            setError(result.message)
          }
        } finally {
          setUploading((count) => Math.max(0, count - 1))
        }
      }

      await refreshAssets()

      if (uploaded.length === 0) return

      const ready = await waitForReadyAssets(props.companyId, uploaded)
      await refreshAssets()

      if (ready.length === 0) {
        setNotice('Файлы загружены, но обработка не завершилась. Добавьте их из медиатеки через минуту.')
        return
      }

      await addAssets(ready)
      setNotice(`Загружено и добавлено файлов: ${ready.length}.`)
    },
    [addAssets, props.companyId, refreshAssets],
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
        items: reordered.filter((item): item is PlaylistDetail['items'][number] => item !== null),
      })

      const result = await call(`/api/dashboard/playlists/${selectedId}/items`, {
        method: 'PUT',
        body: JSON.stringify({ orderedItemIds: ids }),
      })

      if (result?.playlist) {
        setDetail(result.playlist as PlaylistDetail)
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
        setDetail(result.playlist as PlaylistDetail)
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
        setDetail(result.playlist as PlaylistDetail)
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
                    <span className="w-24 shrink-0 text-right">Длительность</span>
                    <span className="w-[104px] shrink-0 text-right">Порядок</span>
                  </li>

                  {detail.items.map((item, index) => (
                    <PlaylistItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={detail.items.length}
                      companyId={props.companyId}
                      canWrite={props.canWrite}
                      defaultImageMs={props.defaultImageDurationMs}
                      onMove={(toIndex) => void move(index, toIndex)}
                      onDropItem={(fromIndex) => void move(fromIndex, index)}
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
                      className="h-8 w-16 border border-border bg-surface px-2 text-[12px]"
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
