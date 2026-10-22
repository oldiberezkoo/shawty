'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormError, FormField, SelectField } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { inviteMember } from '../api'
import type { RoleOption } from '../model'

/** Приглашение сотрудника: письмо не отправляется, ссылка показывается один раз. */
export function InviteDialog(props: {
  companyId: string
  roles: RoleOption[]
  onClose: () => void
  onDone: (email: string, role: string) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    setError(null)
    setBusy(true)

    try {
      const result = await inviteMember(props.companyId, email, role)

      if (!result.ok) {
        setError(result.message)
        return
      }

      props.onDone(email, role)
    } finally {
      setBusy(false)
    }
  }, [email, props, role])

  return (
    <Modal
      open
      onClose={props.onClose}
      title="Пригласить сотрудника"
      description="Письмо не отправляется автоматически: ссылка появится здесь и её нужно передать сотруднику. Показывается один раз."
      size="sm"
      footer={
        <>
          <Button size="sm" onClick={props.onClose}>
            Отмена
          </Button>
          <Button size="sm" variant="primary" disabled={busy || !email} onClick={() => void submit()}>
            Создать приглашение
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

        <FormField
          label="Адрес почты"
          name="email"
          type="email"
          autoFocus
          value={email}
          onValueChange={setEmail}
          placeholder="anna@example.uz"
          description="Приглашение придёт на этот адрес. Если человек уже зарегистрирован в системе, он станет сотрудником сразу."
        />

        <SelectField
          label="Роль"
          name="role"
          value={role}
          onValueChange={(value) => setRole(value ?? 'editor')}
          options={props.roles
            .filter((entry) => entry.role !== 'owner')
            .map((entry) => ({ value: entry.role, label: entry.label }))}
        />
      </div>
    </Modal>
  )
}
