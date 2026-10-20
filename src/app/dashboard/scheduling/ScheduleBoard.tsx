'use client'

import { Notice } from '@/components/ui/status-badge'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { FormError, FormSuccess, SelectField, ToggleField } from '@/components/ui/form'
import { CSRF_COOKIE } from '@/lib/cookie-names'
import { formatDuration } from '@/domain/playlist/rules'

export type VersionChoice = {
  id: string
  playlistName: string
  version: number
  itemCount: number
  totalDurationMs: number
  isCurrent: boolean
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

type ScreenSchedule = {
  screenId: string
  screenName: string
  timezone: string
  timezoneSource: string
  nextChangeAt: string | null
  appliedVersion: number | null
  desiredVersion: number | null
  needsChange: boolean
  campaignId: string | null
  campaignName: string | null
  playlist: { name: string; version: number } | null
  fallbackPlaylist: { name: string; version: number } | null
  chain: { campaignId: string; campaignName: string }[]
}

type Segment = { from: string; to: string; campaignId: string | null; playlistVersionId: string | null }
type CampaignInterval = {
  campaignId: string
  name: string
  priority: number
  intervals: { start: string; end: string }[]
}

type Preview = {
  screen: ScreenSchedule
  from: string
  to: string
  days: number
  segments: Segment[]
  campaigns: CampaignInterval[]
  nextChangeAt: string | null
}

const REFRESH_MS = 10_000

/** Человекочитаемая зона: оператор видит свои часы, а не UTC. */
function zoneLabel(timezone: string, source: string): string {
  const origin =
    source === 'branch' ? 'зона филиала' : source === 'screen' ? 'зона экрана' : source === 'company' ? 'зона компании' : 'UTC по умолчанию'
  return `${timezone} · ${origin}`
}

function formatTime(value: string | null, timezone: string): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDay(value: string, timezone: string): string {
  return new Date(value).toLocaleString('ru-RU', { timeZone: timezone, weekday: 'short', day: '2-digit', month: '2-digit' })
}

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
  versions: VersionChoice[]
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
  const [publishNow, setPublishNow] = useState(true)
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

      const response = await fetch(path, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-company-id': companyId,
          'x-csrf-token': readCsrf(),
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
    [companyId],
  )

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/schedule', {
        headers: { 'x-company-id': companyId },
        cache: 'no-store',
      })

      if (!response.ok) return

      const data = (await response.json()) as { screens: ScreenSchedule[] }
      setScreens(data.screens)
      setSelectedId((current) => current ?? data.screens[0]?.screenId ?? null)
    } catch {
      // Опрос фоновый: молчание лучше мигающей ошибки. Следующий тик попробует снова.
    }
  }, [companyId])

  const assign = useCallback(async () => {
    const screenIds = [...picked]
    if (screenIds.length === 0 || !versionId) return

    const assigned = await call('/api/dashboard/releases', {
      method: 'PUT',
      body: JSON.stringify({ screenIds, playlistVersionId: versionId }),
    })

    if (!assigned) return

    if (publishNow && canPublish) {
      const published = await call('/api/dashboard/releases', {
        method: 'POST',
        body: JSON.stringify({ screenIds }),
      })

      if (!published) return

      setNotice(`Программа назначена экранам: ${screenIds.length}. Публикация ${published.version} выпущена.`)
    } else {
      setNotice(`Программа назначена экранам: ${screenIds.length}. Публикация не выпущена.`)
    }

    setAssignOpen(false)
    setPicked(new Set())
    await load()
  }, [call, canPublish, load, picked, publishNow, versionId])

  const unassign = useCallback(async () => {
    const screenIds = [...picked]
    if (screenIds.length === 0) return

    const result = await call('/api/dashboard/releases', {
      method: 'DELETE',
      body: JSON.stringify({ screenIds }),
    })

    if (!result) return

    setNotice(
      `Назначений снято: ${result.removed}. Экраны продолжат играть последнюю выложенную программу до следующей публикации.`,
    )
    setPicked(new Set())
    await load()
  }, [call, load, picked])

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
      try {
        const response = await fetch(`/api/dashboard/schedule?screenId=${encodeURIComponent(selectedId)}&days=7`, {
          headers: { 'x-company-id': companyId },
          cache: 'no-store',
        })

        if (!response.ok || stopped) return

        // Маршрут отвечает `{ preview }`: без разворота в состоянии оказывался
        // конверт, и календарь падал на `preview.screen.timezone`.
        const data = (await response.json()) as { preview: Preview }
        setPreview(data.preview)
        setError(null)
      } catch {
        setError('Календарь пока недоступен')
      }
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
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-primary-border bg-primary-soft px-4 py-3 shadow-[var(--shadow-sm)]">
          <span className="text-[13px] font-medium text-primary">Выбрано экранов: {pickedCount}</span>

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
          Назначить пока нечего: нет ни одной опубликованной версии плейлиста. Откройте «Плейлисты» и нажмите
          «Опубликовать версию» — после этого программа станет доступна здесь.
        </Notice>
      ) : null}

      <Card>
        <CardHeader
          title="Что и когда идёт на экранах"
          description="Расписание считает сервер. «Ожидает смены» значит, что программа по расписанию отличается от выложенной — публикацию выпустит насос расписания в ближайшие секунды. Отметьте экраны, чтобы назначить или снять программу сразу нескольким."
        />
        <CardBody className="p-0">
          <div className="@container w-full overflow-x-auto">
          <table className="stack-table w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                <th className="w-10 px-5 py-2 font-normal">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все экраны"
                    checked={screens.length > 0 && pickedCount === screens.length}
                    onChange={() =>
                      setPicked(pickedCount === screens.length ? new Set() : new Set(screens.map((screen) => screen.screenId)))
                    }
                    className="size-4 cursor-pointer accent-[var(--primary)]"
                  />
                </th>
                <th className="px-5 py-2 font-normal">Экран</th>
                <th className="px-5 py-2 font-normal">Сейчас идёт</th>
                <th className="px-5 py-2 font-normal">Источник</th>
                <th className="px-5 py-2 font-normal">Смена программы</th>
                <th className="px-5 py-2 text-right font-normal">Состояние</th>
              </tr>
            </thead>
            <tbody>
              {screens.map((screen) => (
                <tr
                  key={screen.screenId}
                  onClick={() => setSelectedId(screen.screenId)}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    screen.screenId === selectedId ? 'bg-surface-2' : ''
                  }`}
                >
                  <td className="px-5 py-2">
                    <input
                      type="checkbox"
                      checked={picked.has(screen.screenId)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => togglePicked(screen.screenId)}
                      aria-label={`Выбрать ${screen.screenName}`}
                      className="size-4 cursor-pointer accent-[var(--primary)]"
                    />
                  </td>
                  <td data-primary className="px-5 py-2">
                    <div className="font-medium">{screen.screenName}</div>
                    <div className="text-[12px] text-text-subtle">{zoneLabel(screen.timezone, screen.timezoneSource)}</div>
                  </td>
                  <td data-label="Сейчас идёт" className="px-5 py-2">
                    {screen.playlist ? (
                      <>
                        <div>
                          {screen.campaignName ?? 'постоянная программа'}
                          {screen.playlist ? ` · ${screen.playlist.name} в.${screen.playlist.version}` : ''}
                        </div>
                        {screen.fallbackPlaylist ? (
                          <div className="text-[12px] text-text-subtle">
                            запасной: {screen.fallbackPlaylist.name} в.{screen.fallbackPlaylist.version}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-text-subtle">ничего не назначено</span>
                    )}
                  </td>
                  <td data-label="Источник" className="px-5 py-2 text-text-muted">
                    {screen.chain.length === 0 ? (
                      <span className="text-text-subtle">только постоянная программа</span>
                    ) : (
                      screen.chain.map((entry, index) => (
                        <div key={entry.campaignId}>
                          {index + 1}. {entry.campaignName}
                        </div>
                      ))
                    )}
                  </td>
                  <td data-label="Смена программы" className="px-5 py-2 text-text-muted">
                    {formatTime(screen.nextChangeAt, screen.timezone)}
                  </td>
                  <td data-label="Состояние" className="tnum px-5 py-2 text-right">
                    {screen.needsChange ? (
                      <span className="text-warn">ожидает смены</span>
                    ) : screen.appliedVersion != null ? (
                      <span className="text-success">применено</span>
                    ) : (
                      <span className="text-text-subtle">не публиковалось</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {screens.length === 0 ? (
            <EmptyState
              title="Экранов пока нет"
              hint="Расписание считается для конкретных экранов: пока их нет, показать нечего. Подключите первый — и здесь появится, что и когда на нём идёт."
              action={
                <Link href="/pair">
                  <Button size="sm" variant="primary">
                    Подключить экран
                  </Button>
                </Link>
              }
            />
          ) : null}
        </CardBody>
      </Card>

      {preview ? <Timeline preview={preview} /> : null}

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Назначить программу: ${pickedCount} экранов`}
        description="Выбирается опубликованная версия плейлиста. Назначение на конкретный экран перекрывает назначения филиала и компании."
        footer={
          <>
            <Button size="md" onClick={() => setAssignOpen(false)}>
              Отмена
            </Button>
            <Button size="md" variant="primary" disabled={busy || !versionId} onClick={() => void assign()}>
              Назначить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <SelectField
            label="Плейлист"
            name="playlist-version"
            value={versionId}
            onValueChange={(value) => setVersionId(value ?? '')}
            options={versions.map((version) => ({
              value: version.id,
              label: `${version.playlistName} · версия ${version.version}${version.isCurrent ? ' (текущая)' : ''} · ${version.itemCount} мат. · ${formatDuration(version.totalDurationMs)}`,
            }))}
            placeholder="Выберите версию"
          />

          {canPublish ? (
            <ToggleField
              name="publish-now"
              label="Опубликовать сразу"
              description="Экраны получат программу в ближайшие секунды. Без публикации назначение сохранится, но останется невидимым."
              defaultChecked
              onChange={setPublishNow}
            />
          ) : null}
        </div>
      </Modal>
    </div>
  )
}

/** Полоска недели с отрезками разных кампаний. */
function Timeline({ preview }: { preview: Preview }) {
  const from = new Date(preview.from).getTime()
  const to = new Date(preview.to).getTime()
  const span = Math.max(1, to - from)
  const zone = preview.screen.timezone

  const position = (value: string) => ((new Date(value).getTime() - from) / span) * 100

  return (
    <Card>
      <CardHeader
        title={`Календарь: ${preview.screen.screenName}`}
        description={`${formatDay(preview.from, zone)} — ${formatDay(preview.to, zone)} · ${zoneLabel(zone, preview.screen.timezoneSource)}`}
      />
      <CardBody className="flex flex-col gap-3">
        <div className="relative h-9 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-2">
          {preview.segments.map((segment, index) => {
            const left = position(segment.from)
            const right = position(segment.to)

            return (
              <div
                key={index}
                title={`${formatTime(segment.from, zone)} — ${formatTime(segment.to, zone)}`}
                className={`absolute top-0 h-full border-r border-border ${
                  segment.campaignId ? 'bg-primary/70' : 'bg-surface-3'
                }`}
                style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(0.4, right - left)}%` }}
              />
            )
          })}
        </div>

        <div className="flex justify-between text-[12px] text-text-subtle">
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index}>{formatDay(new Date(from + (span * index) / 7).toISOString(), zone)}</span>
          ))}
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-3 text-[13px]">
          <span className="text-[12px] text-text-muted">Кампании на этом экране</span>
          {preview.campaigns.length === 0 ? (
            <span className="text-text-subtle">Активных кампаний нет: идёт постоянная программа.</span>
          ) : (
            preview.campaigns.map((campaign) => (
              <div key={campaign.campaignId} className="text-text-muted">
                <span className="font-medium text-text">{campaign.name}</span> · приоритет {campaign.priority} ·{' '}
                {campaign.intervals.length === 0
                  ? 'в этом горизонте не показывается'
                  : campaign.intervals
                      .slice(0, 6)
                      .map((interval) => `${formatTime(interval.start, zone)}–${formatTime(interval.end, zone)}`)
                      .join(', ')}
              </div>
            ))
          )}
        </div>

        <p className="text-[12px] text-text-subtle">
          Следующая смена: {formatTime(preview.nextChangeAt, zone)}. Плеер узнаёт её заранее и готовит публикацию до
          переключения — экран не гаснет в момент смены рекламы.
        </p>
      </CardBody>
    </Card>
  )
}