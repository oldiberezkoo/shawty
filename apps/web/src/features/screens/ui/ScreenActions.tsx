'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { FormError, FormField, FormSuccess, SelectField } from '@/components/ui/form'
import { dashboardRequest } from '@/shared/api/dashboard-client'
import {
  RELEASES_PATH,
  assignScreensRequest,
  publishScreensRequest,
} from '@/shared/api/releases'
import { describePlaylistVersion, type PlaylistVersionChoice } from '@/shared/lib/playlist-version'
import type { ScreenEditValues } from '../model'

/**
 * Действия на карточке экрана.
 *
 * Три вещи, за которыми сюда приходят: переименовать и перенести в филиал,
 * назначить программу именно этому телевизору, выпустить публикацию. Всё
 * остальное на странице — только чтение.
 */
export function ScreenActions(props: {
  companyId: string
  screen: ScreenEditValues
  branches: { id: string; name: string }[]
  groups: { id: string; name: string; branchId: string | null }[]
  versions: PlaylistVersionChoice[]
  canWrite: boolean
  canAssign: boolean
  canPublish: boolean
}) {
  const router = useRouter()

  const [editOpen, setEditOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [versionId, setVersionId] = useState(props.versions[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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

  const save = useCallback(
    async (form: HTMLFormElement) => {
      const data = new FormData(form)
      const name = String(data.get('name') ?? '').trim()
      const branchId = String(data.get('branchId') ?? '')
      const groupId = String(data.get('groupId') ?? '')
      const offlineAfterSec = Number(data.get('offlineAfterSec') ?? props.screen.offlineAfterSec)

      const result = await call(`/api/dashboard/screens/${props.screen.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          branchId: branchId.length > 0 ? branchId : null,
          groupId: groupId.length > 0 ? groupId : null,
          offlineAfterSec,
        }),
      })

      if (!result) return

      setEditOpen(false)
      setNotice('Изменения сохранены.')
      router.refresh()
    },
    [call, props.screen.id, props.screen.offlineAfterSec, router],
  )

  const assign = useCallback(async () => {
    if (!versionId) return

    const assigned = await call(RELEASES_PATH, assignScreensRequest([props.screen.id], versionId))

    if (!assigned) return

    if (props.canPublish) {
      const published = await call(RELEASES_PATH, publishScreensRequest([props.screen.id]))

      if (!published) return
      setNotice('Назначено. Экран получит программу автоматически в ближайшие секунды.')
    } else {
      setNotice('Назначение сохранено. Для показа нужна публикация.')
    }

    setAssignOpen(false)
    router.refresh()
  }, [call, props.canPublish, props.screen.id, router, versionId])

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      <div className="flex flex-wrap gap-2">
        {props.canWrite ? (
          <Button size="md" onClick={() => setEditOpen(true)}>
            Название и размещение
          </Button>
        ) : null}

        {props.canAssign ? (
          <Button
            size="md"
            variant="primary"
            disabled={props.versions.length === 0}
            onClick={() => {
              setVersionId(props.versions[0]?.id ?? '')
              setAssignOpen(true)
            }}
          >
            Назначить плейлист
          </Button>
        ) : null}
      </div>

      {props.versions.length === 0 ? (
        <p className="text-[12.5px] text-text-subtle">
          Назначить пока нечего: в компании нет плейлистов. Добавьте файлы в разделе «Плейлисты».
        </p>
      ) : null}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Экран"
        description="Название видно только в панели. Перенос в другой филиал меняет расписание, которое к нему применяется."
        footer={
          <>
            <Button size="md" onClick={() => setEditOpen(false)}>
              Отмена
            </Button>
            <Button size="md" variant="primary" form="screen-edit-form" type="submit" disabled={busy}>
              Сохранить
            </Button>
          </>
        }
      >
        <form
          id="screen-edit-form"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void save(event.currentTarget)
          }}
        >
          <FormField label="Название" name="name" defaultValue={props.screen.name} required maxLength={120} />

          <SelectField
            label="Филиал"
            name="branchId"
            defaultValue={props.screen.branchId ?? ''}
            placeholder="Без филиала"
            options={[{ value: '', label: 'Без филиала' }, ...props.branches.map((branch) => ({ value: branch.id, label: branch.name }))]}
          />

          <SelectField
            label="Группа"
            name="groupId"
            defaultValue={props.screen.groupId ?? ''}
            placeholder="Без группы"
            options={[{ value: '', label: 'Без группы' }, ...props.groups.map((group) => ({ value: group.id, label: group.name }))]}
            error={null}
          />

          <FormField
            label="Считать «нет связи» через, секунд"
            name="offlineAfterSec"
            type="number"
            min={30}
            max={3600}
            defaultValue={props.screen.offlineAfterSec}
            description="Меньше 60 секунд даёт ложные тревоги: сеть торгового центра мигает постоянно."
          />
        </form>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Назначить плейлист этому экрану"
        description="Назначение на конкретный экран перекрывает назначения филиала и компании."
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
              Экран получит программу автоматически — отдельная публикация не нужна.
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
