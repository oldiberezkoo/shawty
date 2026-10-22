'use client'

import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { TIMEZONE_HINTS } from '../config'
import type { BranchView } from '../model'

/** Создание и правка филиала. Часовой пояс — подсказка, но свободный ввод. */
export function BranchDialog(props: {
  open: boolean
  branch: BranchView | null
  busy: boolean
  onClose: () => void
  onSave: (form: HTMLFormElement, id?: string) => void
}) {
  const { branch } = props

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={branch ? 'Филиал' : 'Новый филиал'}
      description="Часовой пояс можно не указывать: тогда филиал работает по зоне компании."
      footer={
        <>
          <Button size="md" onClick={props.onClose}>
            Отмена
          </Button>
          <Button size="md" variant="primary" type="submit" form="branch-form" disabled={props.busy}>
            Сохранить
          </Button>
        </>
      }
    >
      <datalist id="timezone-hints">
        {TIMEZONE_HINTS.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>

      <form
        id="branch-form"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          props.onSave(form, branch?.id)
        }}
      >
        <FormField
          label="Название"
          name="name"
          defaultValue={branch?.name ?? ''}
          placeholder="Например, «ТРЦ Compass»"
          required
          autoFocus
          maxLength={120}
        />

        <FormField
          label="Код"
          name="code"
          defaultValue={branch?.code ?? ''}
          placeholder="Необязательно: короткий код площадки"
          maxLength={32}
        />

        <FormField
          label="Часовой пояс"
          name="timezone"
          list="timezone-hints"
          defaultValue={branch?.timezone ?? ''}
          placeholder="Asia/Tashkent"
          maxLength={64}
          description="Формат IANA. Если пусто — берётся зона компании."
        />
      </form>
    </Modal>
  )
}
