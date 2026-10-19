'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { FormError, FormSuccess, SelectField, ToggleField } from '@/components/ui/form'
import { StatusBadge, type ScreenState } from '@/components/ui/status-badge'
import { DataTable, type TableColumn } from '@/components/ui/table'
import { CSRF_COOKIE } from '@/lib/cookie-names'
import { formatDuration } from '@/domain/playlist/rules'

export type ScreenRow = {
  id: string
  name: string
  onlineState: ScreenState
  branchId: string | null
  branchName: string | null
  groupId: string | null
  groupName: string | null
  deviceId: string | null
  lastSeenSecondsAgo: number | null
  playerVersion: string | null
  desiredVersion: number | null
  appliedVersion: number | null
}

export type VersionOption = {
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

function relativeTime(seconds: number | null): string {
  if (seconds === null) return 'ни разу'
  if (seconds < 60) return `${seconds} сек назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const COLUMNS: TableColumn[] = [
  { key: 'select', label: '' },
  { key: 'name', label: 'Экран', primary: true },
  { key: 'group', label: 'Группа' },
  { key: 'player', label: 'Плеер', secondary: true },
  { key: 'heartbeat', label: 'Связь', align: 'right' },
  { key: 'state', label: 'Состояние', align: 'right' },
]

/**
 * Парк экранов.
 *
 * Список сгруппирован по филиалам: экран без филиала и экран филиала — разные
 * вещи, и в общем списке связь между ними теряется. Выбор нескольких экранов
 * нужен для массового действия: назначить плейлист сразу группе телевизоров,
 * а не открывать их по одному.
 */
export function ScreensBoard(props: {
  companyId: string
  screens: ScreenRow[]
  versions: VersionOption[]
  canAssign: boolean
  canPublish: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [versionId, setVersionId] = useState('')
  const [publishNow, setPublishNow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const byBranch = useMemo(() => {
    const map = new Map<string, ScreenRow[]>()

    for (const screen of props.screens) {
      const key = screen.branchName ?? 'Без филиала'
      const list = map.get(key) ?? []
      list.push(screen)
      map.set(key, list)
    }

    return map
  }, [props.screens])

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleBranch = useCallback((ids: string[]) => {
    setSelected((current) => {
      const next = new Set(current)
      const allSelected = ids.every((id) => next.has(id))

      for (const id of ids) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }

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
          'x-company-id': props.companyId,
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
    [props.companyId],
  )

  const assign = useCallback(async () => {
    const screenIds = [...selected]
    if (screenIds.length === 0 || !versionId) return

    const assigned = await call('/api/dashboard/releases', {
      method: 'PUT',
      body: JSON.stringify({ screenIds, playlistVersionId: versionId }),
    })

    if (!assigned) return

    const version = props.versions.find((item) => item.id === versionId)

    if (publishNow && props.canPublish) {
      const published = await call('/api/dashboard/releases', {
        method: 'POST',
        body: JSON.stringify({ screenIds }),
      })

      if (!published) return

      setNotice(
        `Назначено экранам: ${screenIds.length}. Публикация версии ${published.version} выпущена — экраны применят её в ближайшие секунды.`,
      )
    } else {
      setNotice(
        `Назначено экранам: ${screenIds.length} («${version?.playlistName ?? ''}» в.${version?.version ?? ''}). Публикация не выпущена: изменения начнут показываться после «Опубликовать» в разделе «Публикация».`,
      )
    }

    setAssignOpen(false)
    setSelected(new Set())
  }, [call, props.canPublish, props.versions, publishNow, selected, versionId])

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      {selected.size > 0 ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-primary-border bg-primary-soft px-4 py-3 shadow-[var(--shadow-sm)]">
          <span className="text-[13px] font-medium text-primary">
            Выбрано {selected.size} {plural(selected.size, 'экран', 'экрана', 'экранов')}
          </span>

          {props.canAssign ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setVersionId(props.versions[0]?.id ?? '')
                setAssignOpen(true)
              }}
              disabled={props.versions.length === 0}
            >
              Назначить плейлист
            </Button>
          ) : null}

          {props.versions.length === 0 ? (
            <span className="text-[12px] text-text-muted">
              Нет опубликованных версий плейлистов — сначала опубликуйте версию в разделе «Плейлисты».
            </span>
          ) : null}

          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Снять выбор
          </Button>
        </div>
      ) : null}

      {[...byBranch.entries()].map(([branchName, items]) => {
        const ids = items.map((screen) => screen.id)
        const allSelected = ids.every((id) => selected.has(id))

        return (
          <Card key={branchName}>
            <CardHeader
              title={branchName}
              description={`${items.length} ${plural(items.length, 'экран', 'экрана', 'экранов')}`}
              action={
                <Button size="sm" variant="ghost" onClick={() => toggleBranch(ids)}>
                  {allSelected ? 'Снять выбор' : 'Выбрать все'}
                </Button>
              }
            />

            <CardBody className="p-0">
              <DataTable
                columns={COLUMNS}
                caption={`Экраны филиала «${branchName}»`}
                rowKey={(row) => String(row.id)}
                rows={items.map((screen) => ({
                  id: screen.id,
                  select: (
                    <input
                      type="checkbox"
                      checked={selected.has(screen.id)}
                      onChange={() => toggle(screen.id)}
                      aria-label={`Выбрать ${screen.name}`}
                      className="size-4 cursor-pointer accent-[var(--primary)]"
                    />
                  ),
                  name: (
                    <Link href={`/dashboard/screens/${screen.id}`} className="font-medium hover:underline">
                      {screen.name}
                    </Link>
                  ),
                  group: screen.groupName ?? <span className="text-text-subtle">—</span>,
                  player: screen.playerVersion ?? <span className="text-text-subtle">—</span>,
                  heartbeat: (
                    <span className="tnum text-text-muted">{relativeTime(screen.lastSeenSecondsAgo)}</span>
                  ),
                  state: <StatusBadge state={screen.onlineState} />,
                }))}
              />
            </CardBody>
          </Card>
        )
      })}

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Назначить плейлист: ${selected.size} ${plural(selected.size, 'экран', 'экрана', 'экранов')}`}
        description="Выбирается опубликованная версия. Каждому экрану назначение ставится отдельно, поэтому позже его можно изменить у одного, не задевая остальные."
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
            options={props.versions.map((version) => ({
              value: version.id,
              label: `${version.playlistName} · версия ${version.version}${
                version.isCurrent ? ' (текущая)' : ''
              } · ${version.itemCount} мат. · ${formatDuration(version.totalDurationMs)}`,
            }))}
            placeholder="Выберите версию"
          />

          {props.canPublish ? (
            <ToggleField
              name="publish-now"
              label="Опубликовать сразу"
              description="Экраны получат новую программу в ближайшие секунды. Без этого назначение сохранится, но останется невидимым, пока публикация не выпущена."
              defaultChecked
              onChange={setPublishNow}
            />
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
