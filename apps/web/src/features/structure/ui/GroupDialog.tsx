'use client'

import { Button } from '@/components/ui/button'
import { FormField, SelectField } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import type { BranchView, GroupView } from '../model'

/** Создание и правка группы экранов внутри филиала. */
export function GroupDialog(props: {
  open: boolean
  group: GroupView | null
  branches: BranchView[]
  busy: boolean
  onClose: () => void
  onSave: (form: HTMLFormElement, id?: string) => void
}) {
  const { group } = props
  const branchOptions = props.branches.map((branch) => ({ value: branch.id, label: branch.name }))

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={group ? 'Группа экранов' : 'Новая группа'}
      description="Группа — это набор экранов внутри филиала. Экраны добавляются в неё на карточке экрана."
      footer={
        <>
          <Button size="md" onClick={props.onClose}>
            Отмена
          </Button>
          <Button size="md" variant="primary" type="submit" form="group-form" disabled={props.busy}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        id="group-form"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          props.onSave(form, group?.id)
        }}
      >
        <FormField
          label="Название"
          name="name"
          defaultValue={group?.name ?? ''}
          placeholder="Например, «Витрина»"
          required
          autoFocus
          maxLength={120}
        />

        <SelectField
          label="Филиал"
          name="branchId"
          defaultValue={group?.branchId ?? ''}
          placeholder="Без филиала"
          options={[{ value: '', label: 'Без филиала' }, ...branchOptions]}
        />
      </form>
    </Modal>
  )
}
