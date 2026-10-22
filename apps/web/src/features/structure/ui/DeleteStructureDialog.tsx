'use client'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { DeleteTarget } from '../model'

/** Подтверждение удаления филиала или группы. */
export function DeleteStructureDialog(props: {
  target: DeleteTarget | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { target } = props

  return (
    <Modal
      open={target !== null}
      onClose={props.onClose}
      title={target?.kind === 'branch' ? 'Удалить филиал?' : 'Удалить группу?'}
      description={
        target?.kind === 'branch'
          ? `«${target.name}» будет удалён. Экраны останутся в сети без филиала, группы филиала тоже сохранятся.`
          : `«${target?.name ?? ''}» будет удалена. Экраны останутся без группы.`
      }
      size="sm"
      footer={
        <>
          <Button size="md" onClick={props.onClose}>
            Отмена
          </Button>
          <Button size="md" variant="danger" disabled={props.busy} onClick={props.onConfirm}>
            Удалить
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-text-muted">
        Если на филиал или группу назначен плейлист либо ссылается кампания, удаление будет отклонено: сначала
        снимите назначение.
      </p>
    </Modal>
  )
}
