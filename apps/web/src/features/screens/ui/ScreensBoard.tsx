'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { FormError, FormSuccess, SelectField } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { DataTable, type TableColumn } from '@/components/ui/table'
import { dashboardRequest } from '@/shared/api/dashboard-client'
import {
  RELEASES_PATH,
  assignScreensRequest,
  publishScreensRequest,
} from '@/shared/api/releases'
import { plural } from '@/shared/lib/plural'
import { describePlaylistVersion, type PlaylistVersionChoice } from '@/shared/lib/playlist-version'
import { formatSecondsAgo } from '@/shared/lib/relative-time'
import type { ScreenRow } from '../model'

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
  versions: PlaylistVersionChoice[]
  canAssign: boolean
  canPublish: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [versionId, setVersionId] = useState('')
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

  const assign = useCallback(async () => {
    const screenIds = [...selected]
    if (screenIds.length === 0 || !versionId) return

    const assigned = await call(RELEASES_PATH, assignScreensRequest(screenIds, versionId))

    if (!assigned) return

    if (props.canPublish) {
      const published = await call(RELEASES_PATH, publishScreensRequest(screenIds))

      if (!published) return

      setNotice(
        `Назначено экранам: ${screenIds.length}. Экран получит программу автоматически в ближайшие секунды.`,
      )
    } else {
      setNotice(`Назначено экранам: ${screenIds.length}. Для показа нужна публикация.`)
    }

    setAssignOpen(false)
    setSelected(new Set())
  }, [call, props.canPublish, selected, versionId])

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      {selected.size > 0 ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 border border-border-strong border-l-[3px] border-l-primary bg-surface-2 px-4 py-3">
          <span className="text-[13px] font-medium text-text">
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
              Нет плейлистов — сначала добавьте файлы в разделе «Плейлисты».
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
                    <span className="tnum text-text-muted">{formatSecondsAgo(screen.lastSeenSecondsAgo)}</span>
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
        description="Выбирается плейлист. Каждому экрану назначение ставится отдельно, поэтому позже его можно изменить у одного, не задевая остальные."
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
              label: describePlaylistVersion(version),
            }))}
            placeholder="Выберите плейлист"
          />

          {props.canPublish ? (
            <p className="text-[12px] leading-relaxed text-text-muted">
              После назначения экран получит программу автоматически — отдельная публикация не нужна.
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
