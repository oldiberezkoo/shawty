'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'

/** Создание плейлиста: одно поле и явная кнопка, без промежуточных шагов. */
export function CreatePlaylistModal(props: {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (props.open) {
      setName('')
      setPending(false)
    }
  }, [props.open])

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Новый плейлист"
      description="Плейлист — это порядок и длительность показа. Изменения применяются на экранах сразу."
      size="sm"
      footer={
        <>
          <Button size="md" onClick={props.onClose}>
            Отмена
          </Button>
          <Button
            size="md"
            variant="primary"
            disabled={pending || name.trim().length === 0}
            onClick={() => {
              setPending(true)
              void props.onCreate(name.trim()).then((ok) => {
                setPending(false)
                if (ok) props.onClose()
              })
            }}
          >
            Создать
          </Button>
        </>
      }
    >
      <FormField
        label="Название"
        name="playlist-name"
        value={name}
        onValueChange={setName}
        placeholder="Например, «Витрина — основная»"
        required
        autoFocus
        maxLength={120}
        description="Например, по площадке или по задаче: «Витрина», «Акция — март»."
      />
    </Modal>
  )
}
