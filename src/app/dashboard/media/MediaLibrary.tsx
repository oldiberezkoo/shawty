'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { CSRF_COOKIE } from '@/lib/cookie-names'

export type MediaItem = {
  id: string
  kind: 'image' | 'video'
  state: 'processing' | 'ready' | 'failed'
  mime: string
  bytes: number
  width: number | null
  height: number | null
  durationMs: number | null
  transcoded: boolean
  error: string | null
  hasPoster: boolean
  createdAt: string
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${bytes} Б`
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

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
  const [error, setError] = useState<string | null>(null)
  /** Файл занят: показываем разбор и спрашиваем подтверждение явно. */
  const [blocked, setBlocked] = useState<{ assetId: string; message: string } | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  /**
   * Обработка идёт на сервере: новый файл появляется в состоянии
   * «обработка» и становится готовым через несколько секунд. Поэтому
   * опрашиваем список, пока есть незавершённые элементы, и останавливаемся,
   * как только всё готово — пустой опрос в простое не нужен.
   */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/media', {
        headers: { 'x-company-id': props.companyId },
      })
      if (!response.ok) return

      const data = (await response.json()) as { assets: MediaItem[] }
      setAssets(data.assets)
    } catch {
      // Сеть моргнула: следующая попытка повторит.
    }
  }, [props.companyId])

  const hasPending = assets.some((asset) => asset.state === 'processing')

  useEffect(() => {
    if (!hasPending) return

    const timer = setInterval(() => {
      void refresh()
    }, 2500)
    return () => clearInterval(timer)
  }, [hasPending, refresh])

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setError(null)

      const list = Array.from(files)
      if (list.length === 0) return

      setUploading((count) => count + list.length)

      for (const file of list) {
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
          }
        } catch {
          setError(`Сервер недоступен при загрузке ${file.name}`)
        } finally {
          setUploading((count) => Math.max(0, count - 1))
        }
      }

      await refresh()
    },
    [props.companyId, refresh],
  )

  const remove = useCallback(
    async (assetId: string, force: boolean) => {
      setError(null)

      const params = new URLSearchParams({
        companyId: props.companyId,
        assetId,
        ...(force ? { force: 'true' } : {}),
      })

      const response = await fetch(`/api/dashboard/media/file?${params.toString()}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': readCsrf() },
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null

        // 409 — файл входит в плейлист. Это не ошибка, а предупреждение:
        // показываем, чем занят файл, и просим подтвердить удаление явно.
        if (response.status === 409) {
          setBlocked({ assetId, message: data?.error?.message ?? 'Файл используется' })
          return
        }

        setError(data?.error?.message ?? 'Не удалось удалить файл')
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
      const haystack = `${asset.mime} ${asset.width ?? ''}x${asset.height ?? ''}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border p-0.5">
          {(['all', 'image', 'video'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[13px] transition-colors ${
                kind === value ? 'bg-surface-2 font-medium text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {value === 'all' ? 'Все' : value === 'image' ? 'Изображения' : 'Видео'}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по типу или разрешению"
          className="h-9 w-full max-w-[280px] rounded-[var(--radius-md)] border border-border bg-surface px-3 text-[13px]"
        />

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
              <Button variant="primary" size="sm" onClick={() => inputRef.current?.click()}>
                Загрузить файлы
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {props.canUpload ? (
        <div
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
          className={`rounded-[var(--radius-lg)] border border-dashed px-4 py-6 text-center text-[13px] transition-colors ${
            dragActive ? 'border-text-muted bg-surface-2 text-text' : 'border-border text-text-subtle'
          }`}
        >
          Перетащите файлы сюда или нажмите «Загрузить файлы»
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-[13px] text-text-muted">
            Медиатека пуста. Загрузите изображение или ролик — файл сразу попадёт
            в библиотеку и станет доступен для плейлистов.
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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

function MediaCard(props: {
  asset: MediaItem
  companyId: string
  canDelete: boolean
  onDelete: (assetId: string, force: boolean) => Promise<void>
  blocked: string | null
  onClearBlocked: () => void
}) {
  const { asset } = props

  const [dimensions, setDimensions] = useState<string>('')
  const posterUrl = `/api/dashboard/media/file?companyId=${props.companyId}&assetId=${asset.id}&variant=poster`

  // Разрешение показываем из метаданных, а не из картинки: превью уменьшено,
  // и по нему размер не восстановить.
  useEffect(() => {
    if (asset.width && asset.height) setDimensions(`${asset.width}×${asset.height}`)
  }, [asset.width, asset.height])

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-video bg-surface-2">
        {asset.state === 'ready' && asset.hasPoster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : null}

        {asset.state === 'processing' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[12px] text-text-muted">
            <span className="size-4 animate-spin rounded-full border-2 border-border-strong border-t-text" />
            Обработка
          </div>
        ) : null}

        {asset.state === 'failed' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-[12px] text-danger">
            <span>Ошибка обработки</span>
            <span className="text-[11px] text-text-subtle">{asset.error}</span>
          </div>
        ) : null}

        {asset.kind === 'video' && asset.state === 'ready' ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] tabular-nums text-white">
            {formatDuration(asset.durationMs)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] text-text">{asset.mime.replace(/^(image|video)\//, '').toUpperCase()}</span>
          {asset.transcoded ? (
            <span
              title="Файл приведён к профилю MP4/H.264"
              className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              конвертирован
            </span>
          ) : null}
        </div>

        <div className="tnum text-[11px] text-text-subtle">
          {dimensions || '—'} · {formatBytes(asset.bytes)}
        </div>

        {props.blocked ? (
          <div className="mt-1 rounded-[var(--radius-sm)] border border-warn/40 bg-warn-bg px-2 py-1.5">
            <p className="text-[11px] leading-snug text-warn">{props.blocked}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void props.onDelete(props.asset.id, true)}
                className="text-[11px] font-medium text-danger underline underline-offset-2"
              >
                Удалить всё равно
              </button>
              <button
                type="button"
                onClick={props.onClearBlocked}
                className="text-[11px] text-text-muted underline underline-offset-2"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : props.canDelete ? (
          <button
            type="button"
            onClick={() => void props.onDelete(asset.id, false)}
            className="mt-1 self-start text-[11px] text-text-subtle transition-colors hover:text-danger"
          >
            Удалить
          </button>
        ) : null}
      </div>
    </div>
  )
}
