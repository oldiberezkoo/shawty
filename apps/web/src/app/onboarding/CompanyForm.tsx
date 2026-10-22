'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormError, FormField } from '@/components/ui/form'
import { Window } from '@/components/visual/window'
import { readCsrfToken } from '@/shared/lib/csrf'

/**
 * Название сети для уже существующего аккаунта.
 *
 * После создания сессия остаётся прежней, но в ней появляется членство,
 * поэтому нужна полная перезагрузка: серверные компоненты читают сессию
 * заново, а не используют кэш прошлого ответа.
 */
export function CompanyForm() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setError(null)
      setBusy(true)

      try {
        const response = await fetch('/api/auth/company', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': readCsrfToken() },
          body: JSON.stringify({ name }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Не удалось создать сеть')
          return
        }

        window.location.href = '/dashboard'
      } catch {
        setError('Сервер недоступен. Проверьте соединение.')
      } finally {
        setBusy(false)
      }
    },
    [name],
  )

  return (
    <Window title="onboarding" bodyClassName="p-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

        <FormField
          label="Название сети"
          name="companyName"
          value={name}
          onValueChange={setName}
          placeholder="Например, Coffee House"
          required
          autoComplete="organization"
          autoFocus
          description="Так сеть будет называться в панели и в приглашениях сотрудникам."
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy || name.trim().length < 2}
          className="mt-1 w-full"
        >
          {busy ? 'Создаём…' : 'Создать сеть'}
        </Button>
      </form>
    </Window>
  )
}
