'use client'

import { useEffect, useState } from 'react'
import { formatFileSize } from '@/shared/lib/format'
import { formatDuration } from '@/domain/playlist/rules'
import type { PlaylistItem } from '../model'

/**
 * Строка состава плейлиста.
 *
 * Порядок меняется перетаскиванием и стрелками: перетаскивание удобно мышью,
 * стрелки — с клавиатуры и на экране, где drag&drop не работает. У видео нет
 * поля «показ, сек»: ролик всегда играет до конца, и обрезать рекламу
 * посередине нельзя.
 */
export function PlaylistItemRow(props: {
  item: PlaylistItem
  index: number
  total: number
  companyId: string
  canWrite: boolean
  defaultImageMs: number
  onMove: (toIndex: number) => void
  onDropItem: (fromIndex: number) => void
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
        if (Number.isInteger(from)) props.onDropItem(from)
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
          className="h-9 w-16 shrink-0 bg-surface-2 object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-9 w-16 shrink-0 items-center justify-center bg-surface-2 text-[10px] text-text-subtle">
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
          {` · ${formatFileSize(item.bytes)}`}
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
          className="h-8 w-24 shrink-0 border border-border bg-surface px-2 text-right text-[12px] tnum"
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
