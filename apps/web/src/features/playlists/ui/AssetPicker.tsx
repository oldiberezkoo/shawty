'use client'

import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/status-badge'
import type { AssetOption } from '../model'

/**
 * Выбор файлов.
 *
 * Два пути в одном месте: готовые файлы отмечаются галочками, новые
 * загружаются файловым диалогом или перетаскиванием. Разносить их по разным
 * экранам значило бы заставить оператора угадывать, где искать нужное.
 */
export function AssetPicker(props: {
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
      className={`flex flex-col gap-3 border border-dashed p-3 transition-colors ${
        dragActive ? 'border-primary bg-surface-2' : 'border-border'
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
              className={`relative h-[72px] w-[92px] shrink-0 overflow-hidden border-2 ${
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
