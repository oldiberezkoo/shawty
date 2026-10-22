'use client'

import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { describePlaylistVersion, type PlaylistVersionChoice } from '@/shared/lib/playlist-version'

/** Назначение программы выбранным экранам. */
export function AssignDialog(props: {
  open: boolean
  pickedCount: number
  versions: PlaylistVersionChoice[]
  versionId: string
  busy: boolean
  canPublish: boolean
  onClose: () => void
  onVersionChange: (versionId: string) => void
  onAssign: () => void
}) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={`Назначить программу: ${props.pickedCount} экранов`}
      description="Выбирается плейлист. Назначение на конкретный экран перекрывает назначения филиала и компании."
      footer={
        <>
          <Button size="md" onClick={props.onClose}>
            Отмена
          </Button>
          <Button size="md" variant="primary" disabled={props.busy || !props.versionId} onClick={props.onAssign}>
            Назначить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SelectField
          label="Плейлист"
          name="playlist-version"
          value={props.versionId}
          onValueChange={(value) => props.onVersionChange(value ?? '')}
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
  )
}
