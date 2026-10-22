'use client'

import { useCallback, useEffect, useState } from 'react'
import { Notice } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { FormError, FormSuccess } from '@/components/ui/form'
import { dashboardRequest } from '@/shared/api/dashboard-client'
import {
  RELEASES_PATH,
  assignScreensRequest,
  publishScreensRequest,
  unassignScreensRequest,
} from '@/shared/api/releases'
import type { PlaylistVersionChoice } from '@/shared/lib/playlist-version'
import { fetchSchedule, fetchSchedulePreview } from '../api'
import type { Preview, ScreenSchedule } from '../model'
import { AssignDialog } from './AssignDialog'
import { ScheduleTable } from './ScheduleTable'
import { ScheduleTimeline } from './ScheduleTimeline'

const REFRESH_MS = 10_000

/**
 * Календарь показа.
 *
 * Полоса времени на неделю: сегменты идут слева направо в порядке реального
 * времени, а не «дни колонками» — оператору нужно увидеть, где именно ночью
 * программа прыгает с акции на фоновое видео, и для этого нужен один ряд с
 * реальным временем слева.
 */
export function ScheduleBoard({ companyId, versions, canAssign, canPublish }: {
  companyId: string
  versions: PlaylistVersionChoice[]
  canAssign: boolean
  canPublish: boolean
}) {
  const [screens, setScreens] = useState<ScreenSchedule[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [versionId, setVersionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const pickedCount = picked.size

  const togglePicked = useCallback((screenId: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(screenId)) next.delete(screenId)
      else next.add(screenId)
      return next
    })
  }, [])

  const call = useCallback(
    async (path: string, init: RequestInit) => {
      setError(null)
      setBusy(true)

      const result = await dashboardRequest<Record<string, unknown>>(path, init, companyId)

      setBusy(false)

      if (!result.ok) {
        setError(result.message)
        return null
      }

      return result.data
    },
    [companyId],
  )

  const load = useCallback(async () => {
    const next = await fetchSchedule(companyId)
    if (!next) return

    setScreens(next)
    setSelectedId((current) => current ?? next[0]?.screenId ?? null)
  }, [companyId])

  const assign = useCallback(async () => {
    const screenIds = [...picked]
    if (screenIds.length === 0 || !versionId) return

    const assigned = await call(RELEASES_PATH, assignScreensRequest(screenIds, versionId))

    if (!assigned) return

    // Назначение и показ — одно действие. Отдельный переключатель
    // «опубликовать сейчас» оставлял экран со старой программой, и оператор
    // не понимал, почему телевизор не обновился.
    if (canPublish) {
      const published = await call(RELEASES_PATH, publishScreensRequest(screenIds))

      if (!published) return

      setNotice(`Программа назначена экранам: ${screenIds.length}. Экран обновится автоматически.`)
    } else {
      setNotice(`Программа назначена экранам: ${screenIds.length}. Для показа нужна публикация.`)
    }

    setAssignOpen(false)
    setPicked(new Set())
    await load()
  }, [call, canPublish, load, picked, versionId])

  const unassign = useCallback(async () => {
    const screenIds = [...picked]
    if (screenIds.length === 0) return

    const result = await call(RELEASES_PATH, unassignScreensRequest(screenIds))

    if (!result) return

    if (canPublish) {
      await call(RELEASES_PATH, publishScreensRequest(screenIds))
    }

    setNotice(
      canPublish
        ? `Назначения снято: ${result.removed}. Экраны освобождены и обновятся автоматически.`
        : `Назначений снято: ${result.removed}. Для применения нужна публикация.`,
    )
    setPicked(new Set())
    await load()
  }, [call, canPublish, load, picked])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (!stopped) await load()
      if (!stopped) timer = setTimeout(tick, REFRESH_MS)
    }

    void tick()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [load])

  useEffect(() => {
    if (!selectedId) return

    let stopped = false

    const loadPreview = async () => {
      const next = await fetchSchedulePreview(companyId, selectedId)
      if (stopped) return

      if (!next) {
        setError('Календарь пока недоступен')
        return
      }

      setPreview(next)
      setError(null)
    }

    void loadPreview()

    return () => {
      stopped = true
    }
  }, [companyId, selectedId])

  return (
    <div className="flex flex-col gap-6">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      {pickedCount > 0 ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 border border-border-strong border-l-[3px] border-l-primary bg-surface-2 px-4 py-3">
          <span className="text-[13px] font-medium text-text">Выбрано экранов: {pickedCount}</span>

          {canAssign ? (
            <Button
              size="sm"
              variant="primary"
              disabled={versions.length === 0}
              onClick={() => {
                setVersionId(versions[0]?.id ?? '')
                setAssignOpen(true)
              }}
            >
              Назначить программу
            </Button>
          ) : null}

          {canAssign ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unassign()}>
              Снять назначение
            </Button>
          ) : null}

          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Снять выбор
          </Button>
        </div>
      ) : null}

      {canAssign && versions.length === 0 ? (
        <Notice>
          Назначить пока нечего: нет ни одного плейлиста. Откройте «Плейлисты», добавьте файлы — после этого
          программа станет доступна здесь.
        </Notice>
      ) : null}

      <ScheduleTable
        screens={screens}
        selectedId={selectedId}
        picked={picked}
        onSelect={setSelectedId}
        onTogglePicked={togglePicked}
        onToggleAll={() =>
          setPicked(pickedCount === screens.length ? new Set() : new Set(screens.map((screen) => screen.screenId)))
        }
      />

      {preview ? <ScheduleTimeline preview={preview} /> : null}

      <AssignDialog
        open={assignOpen}
        pickedCount={pickedCount}
        versions={versions}
        versionId={versionId}
        busy={busy}
        canPublish={canPublish}
        onClose={() => setAssignOpen(false)}
        onVersionChange={setVersionId}
        onAssign={() => void assign()}
      />
    </div>
  )
}
