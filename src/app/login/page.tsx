'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormError, FormField } from '@/components/ui/form'
import { ThemeToggle } from '@/components/ui/theme-toggle'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const returnTo = params.get('returnTo') ?? '/dashboard'

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(data?.error?.message ?? 'Не удалось войти. Проверьте данные.')
        setPending(false)
        return
      }

      // Полная перезагрузка нужна, чтобы серверные компоненты увидели новую сессию.
      window.location.href = returnTo.startsWith('/') ? returnTo : '/dashboard'
    } catch {
      setError('Сервер недоступен. Проверьте соединение.')
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">SHAWTY</h1>
          <p className="mt-1 text-[13px] text-text-muted">Вход в панель управления</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error ? <FormError>{error}</FormError> : null}

          <FormField
            label="Почта"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="owner@company.uz"
          />
          <FormField label="Пароль" name="password" type="password" autoComplete="current-password" required />

          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending ? 'Проверяем…' : 'Войти'}
          </Button>
        </form>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
