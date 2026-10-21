'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FormField, FormError } from '@/components/ui/form'
import { Window } from '@/components/visual/window'
import { CSRF_COOKIE } from '@/lib/cookie-names'

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/**
 * Форма регистрации.
 *
 * Приходит с токеном приглашения — тогда адрес почты заранее заполнен и
 * заблокирован: приглашение адресовано конкретному человеку, и дать ему
 * вписать чужой адрес значило бы отдать место кому-то другому.
 */
export function RegisterForm({ token }: { token: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setError(null)
      setBusy(true)

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': readCsrf() },
          body: JSON.stringify({ name, email, password, token: token || undefined }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Не удалось создать учётную запись')
          return
        }

        router.push('/dashboard')
        router.refresh()
      } finally {
        setBusy(false)
      }
    },
    [email, name, password, router, token],
  )

  return (
    <Window title="register" bodyClassName="p-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error ? <FormError>{error}</FormError> : null}

        <FormField
          label="Имя"
          name="name"
          value={name}
          onValueChange={setName}
          placeholder="Как к вам обращаться"
          required
          autoComplete="name"
          autoFocus
        />

        <FormField
          label="Почта"
          name="email"
          type="email"
          value={email}
          onValueChange={token ? undefined : setEmail}
          readOnly={Boolean(token)}
          placeholder="you@example.uz"
          required
          autoComplete="email"
          description={token ? 'Адрес из приглашения изменить нельзя.' : undefined}
        />

        <FormField
          label="Пароль"
          name="password"
          type="password"
          value={password}
          onValueChange={setPassword}
          required
          minLength={8}
          autoComplete="new-password"
          description="Не короче 8 символов."
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy || !name || !email || !password}
          className="mt-1 w-full"
        >
          Создать учётную запись
        </Button>

        <p className="text-center text-[12.5px] text-text-muted">
          Уже есть доступ?{' '}
          <Link
            href={token ? `/login?returnTo=${encodeURIComponent(`/join?token=${token}`)}` : '/login'}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary-hover hover:decoration-primary-hover"
          >
            Войти
          </Link>
        </p>
      </form>
    </Window>
  )
}