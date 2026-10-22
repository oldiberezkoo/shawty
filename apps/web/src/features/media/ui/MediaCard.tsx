'use client'

import { useEffect, useState } from 'react'
import { formatFileSize } from '@/shared/lib/format'
import { formatMediaDuration } from '../format'
import type { MediaItem } from '../model'

/** Карточка файла: превью, состояние обработки и удаление. */
export function MediaCard(props: {
  asset: MediaItem
  companyId: string
  canDelete: boolean
  onDelete: (assetId: string, force: boolean) => Promise<void>
  blocked: string | null
  onClearBlocked: () => void
}) {
  const { asset } = props

  const [dimensions, setDimensions] = useState<string>('')
  const [posterAttempt, setPosterAttempt] = useState(0)
  const [posterFailed, setPosterFailed] = useState(false)

  // Хеш постера — это и ключ кеша, и признак того, что картинка обновилась.
  // Без него браузер мог запомнить неудачный ответ и показывать пустую
  // карточку даже после готовности файла.
  const posterVersion = asset.posterSha256 ?? asset.createdAt
  const posterUrl = `/api/dashboard/media/file?companyId=${encodeURIComponent(props.companyId)}&assetId=${encodeURIComponent(asset.id)}&variant=poster&v=${encodeURIComponent(posterVersion)}${posterAttempt > 0 ? `&retry=${posterAttempt}` : ''}`

  useEffect(() => {
    setPosterAttempt(0)
    setPosterFailed(false)
  }, [asset.id, asset.posterSha256])

  // Разрешение показываем из метаданных, а не из картинки: превью уменьшено,
  // и по нему размер не восстановить.
  useEffect(() => {
    if (asset.width && asset.height) setDimensions(`${asset.width}×${asset.height}`)
  }, [asset.width, asset.height])

  return (
    <div className="card overflow-hidden transition-colors hover:border-border-strong">
      <div className="relative aspect-video bg-surface-2">
        {asset.state === 'ready' && asset.hasPoster && !posterFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={posterVersion}
            src={posterUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={() => {
              // Постер мог ещё не успеть записаться, когда ассет уже стал
              // ready. Пара повторов с новым URL закрывает эту гонку.
              if (posterAttempt < 2) setPosterAttempt((attempt) => attempt + 1)
              else setPosterFailed(true)
            }}
          />
        ) : null}

        {asset.state === 'ready' && (!asset.hasPoster || posterFailed) ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[11.5px] text-text-subtle">
            <span className="text-[18px]">{asset.kind === 'video' ? '▶' : '▧'}</span>
            {asset.kind === 'video' ? 'Видео' : 'Изображение'}
          </div>
        ) : null}

        {asset.state === 'processing' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[12px] text-text-muted">
            <span className="size-4 animate-spin border-2 border-border-strong border-t-text" />
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
          <span className="absolute bottom-1.5 right-1.5  bg-black/70 px-1.5 py-0.5 text-[11px] tabular-nums text-white">
            {formatMediaDuration(asset.durationMs)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Имя файла — то, что помнит оператор. Формат без него остаётся
              вторым: без расширения имя «logo-v2» и «logo-final» сливаются. */}
          <span className="truncate text-[12px] text-text" title={asset.fileName ?? undefined}>
            {asset.fileName ?? asset.mime.replace(/^(image|video)\//, '').toUpperCase()}
          </span>
          {asset.transcoded ? (
            <span
              title="Файл приведён к профилю MP4/H.264"
              className="shrink-0  bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              конвертирован
            </span>
          ) : null}
        </div>

        <div className="tnum text-[11px] text-text-subtle">
          {dimensions || '—'} · {formatFileSize(asset.bytes)}
        </div>

        {props.blocked ? (
          <div className="mt-1 border border-border-strong bg-surface-2 px-2 py-1.5">
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
