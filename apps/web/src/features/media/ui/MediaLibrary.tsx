'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, UploadCloud } from 'lucide-react'
import { Button, ButtonIcon } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/card'
import { FormError } from '@/components/ui/form'
import { Notice } from '@/components/ui/status-badge'
import { deleteMediaAsset, fetchMediaAssets, uploadMediaFile } from '../api'
import type { MediaItem } from '../model'
import { MediaCard } from './MediaCard'

export function MediaLibrary(props: {
  companyId: string
  canUpload: boolean
  canDelete: boolean
  folders: { id: string; name: string }[]
  initialAssets: MediaItem[]
}) {
  const [assets, setAssets] = useState<MediaItem[]>(props.initialAssets)
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('all')
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(0)
  /**
   * Файлы, которые уже были в медиатеке.
   *
   * Отдельное состояние, а не ошибка: файл загрузился успешно, его просто
   * не добавили второй раз. Молчание здесь читается как «загрузка не
   * сработала», и оператор начинает перезагружать файл по кругу.
   */
  const [duplicates, setDuplicates] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Файл занят: показываем разбор и спрашиваем подтверждение явно. */
  const [blocked, setBlocked] = useState<{ assetId: string; message: string } | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  /**
   * Защита от гонки запросов. Пока один список в пути, сервер может ответить
   * на более ранний запрос позже — и тогда «готовый» файл на мгновение снова
   * станет «обрабатывается», а превью исчезнет. Применяем только последний
   * ответ и никогда не откатываем уже готовый файл назад.
   */
  const latestRefreshRef = useRef(0)

  /**
   * Обработка идёт на сервере: новый файл появляется в состоянии
   * «обработка» и становится готовым через несколько секунд. Поэтому
   * опрашиваем список, пока есть незавершённые элементы, и останавливаемся,
   * как только всё готово — пустой опрос в простое не нужен.
   */
  const refresh = useCallback(async () => {
    const requestId = ++latestRefreshRef.current

    const next = await fetchMediaAssets(props.companyId)
    if (!next || requestId !== latestRefreshRef.current) return

    setAssets((current) => {
      const byId = new Map(current.map((asset) => [asset.id, asset]))
      return next.map((fresh) => {
        const previous = byId.get(fresh.id)
        // Сервер — источник истины, но обратный переход ready → processing
        // не должен гасить уже показанное превью: это почти всегда ответ
        // старого запроса, а не реальная повторная обработка.
        if (previous?.state === 'ready' && fresh.state === 'processing') {
          return { ...fresh, state: 'ready', hasPoster: previous.hasPoster || fresh.hasPoster }
        }
        return fresh
      })
    })
  }, [props.companyId])

  const hasPending = assets.some((asset) => asset.state === 'processing')

  useEffect(() => {
    if (!hasPending) return

    const timer = setInterval(() => {
      void refresh()
    }, 1500)
    return () => clearInterval(timer)
  }, [hasPending, refresh])

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setError(null)
      setDuplicates([])

      const list = Array.from(files)
      if (list.length === 0) return

      setUploading((count) => count + list.length)
      const seen: string[] = []

      for (const file of list) {
        try {
          const result = await uploadMediaFile(props.companyId, file)

          if (result.kind === 'duplicate') {
            seen.push(file.name)
            continue
          }

          if (result.kind !== 'ok') {
            setError(result.message)
            continue
          }

          if (result.assetId) {
            // Карточка появляется сразу после ответа сервера, не дожидаясь
            // следующего опроса: иначе оператор видит «ничего не произошло»
            // и загружает файл повторно.
            const optimistic: MediaItem = {
              id: result.assetId,
              fileName: file.name,
              kind: file.type.startsWith('video/') ? 'video' : 'image',
              state: result.state === 'ready' ? 'ready' : 'processing',
              mime: file.type,
              bytes: file.size,
              width: null,
              height: null,
              durationMs: null,
              transcoded: false,
              error: null,
              hasPoster: false,
              posterSha256: null,
              createdAt: new Date().toISOString(),
            }

            setAssets((current) => [optimistic, ...current.filter((asset) => asset.id !== optimistic.id)])
          }
        } finally {
          setUploading((count) => Math.max(0, count - 1))
        }
      }

      setDuplicates(seen)
      await refresh()
    },
    [props.companyId, refresh],
  )

  const remove = useCallback(
    async (assetId: string, force: boolean) => {
      setError(null)

      const result = await deleteMediaAsset(props.companyId, assetId, force)

      if (result.kind === 'blocked') {
        setBlocked({ assetId, message: result.message })
        return
      }

      if (result.kind !== 'ok') {
        setError(result.message)
        return
      }

      setBlocked(null)
      await refresh()
    },
    [props.companyId, refresh],
  )

  const visible = assets.filter((asset) => {
    if (kind !== 'all' && asset.kind !== kind) return false
    if (search.trim()) {
      const needle = search.trim().toLowerCase()
      const haystack = `${asset.fileName ?? ''} ${asset.mime} ${asset.width ?? ''}x${asset.height ?? ''}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

      {duplicates.length > 0 ? (
        <Notice
          tone="info"
          onDismiss={() => setDuplicates([])}
          title={duplicates.length === 1 ? 'Такой файл уже есть' : `Таких файлов уже ${duplicates.length}`}
        >
          Повторно не добавляются:{' '}
          <span className="font-medium">{duplicates.slice(0, 3).join(', ')}</span>
          {duplicates.length > 3 ? ` и ещё ${duplicates.length - 3}` : ''}. Если нужен другой вариант — измените
          содержимое, дедупликация сравнивает именно его.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 border border-border-strong bg-surface p-1">
          {(['all', 'image', 'video'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`h-8 px-3 text-[13px] transition-colors ${
                kind === value
                  ? 'bg-primary font-medium text-primary-text'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              {value === 'all' ? 'Все' : value === 'image' ? 'Изображения' : 'Видео'}
            </button>
          ))}
        </div>

        <div className="relative w-full max-w-[280px]">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
            strokeWidth={1.9}
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по имени файла"
            aria-label="Поиск по имени файла"
            className="field pl-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {uploading > 0 ? (
            <span className="text-[12px] text-text-muted">Загружается: {uploading}</span>
          ) : null}
          {props.canUpload ? (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) void upload(event.target.files)
                  event.target.value = ''
                }}
              />
              <Button variant="primary" size="md" onClick={() => inputRef.current?.click()}>
                <ButtonIcon>
                  <UploadCloud className="size-4" strokeWidth={1.9} />
                </ButtonIcon>
                Загрузить файлы
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {props.canUpload ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragActive(false)
            if (event.dataTransfer.files.length > 0) void upload(event.dataTransfer.files)
          }}
          className={`flex flex-col items-center justify-center gap-1.5 border border-dashed px-4 py-5 text-[13px] transition-colors ${
            dragActive
              ? 'border-primary bg-surface-2 text-primary'
              : 'border-border-strong bg-surface/50 text-text-subtle hover:border-border-strong hover:bg-surface-2 hover:text-text-muted'
          }`}
        >
          {/* Подпись меняется при наведении файла: покоящаяся полоса занимает
              место, а работает только в момент перетаскивания. */}
          <UploadCloud className="size-5" strokeWidth={1.6} />
          {dragActive ? 'Отпустите, чтобы загрузить' : 'Перетащите файлы сюда или выберите на компьютере'}
        </button>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title={assets.length === 0 ? 'В медиатеке пока пусто' : 'Ничего не нашлось'}
            hint={
              assets.length === 0
                ? 'Загрузите изображение или ролик — файл сразу попадёт в библиотеку и станет доступен для плейлистов.'
                : 'Попробуйте другое слово или снимите фильтр по типу.'
            }
            icon={
              assets.length === 0 ? (
                <UploadCloud className="size-5" strokeWidth={1.7} />
              ) : (
                <Search className="size-5" strokeWidth={1.7} />
              )
            }
            action={
              assets.length === 0 && props.canUpload ? (
                <Button variant="primary" size="md" onClick={() => inputRef.current?.click()}>
                  <ButtonIcon>
                    <UploadCloud className="size-4" strokeWidth={1.9} />
                  </ButtonIcon>
                  Загрузить файлы
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              companyId={props.companyId}
              canDelete={props.canDelete}
              onDelete={remove}
              blocked={blocked?.assetId === asset.id ? blocked.message : null}
              onClearBlocked={() => setBlocked(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
