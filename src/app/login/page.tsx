'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
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
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[360px] fade-in">
        <div className="mb-7 text-center">
          <div className="text-[15px] font-semibold tracking-[-0.02em]">SHAWTY</div>
          <h1 className="mt-3 text-[19px] font-semibold tracking-[-0.02em]">Вход в панель управления</h1>
          <p className="mt-1 text-[13px] text-text-muted">Публикация контента на экраны сети</p>
        </div>

        <Card>
          <CardBody>
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
              <FormField
                label="Пароль"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />

              <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-1 w-full">
                {pending ? 'Проверяем…' : 'Войти'}
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Ссылка на регистрацию есть не всегда: обычно сотрудника зовут по
            приглашению, и тогда он приходит по своей ссылке. */}
        <p className="mt-5 text-center text-[13px] text-text-muted">
          Получили приглашение?{' '}
          <Link href="/register" className="underline underline-offset-4">
            Создать учётную запись
          </Link>
        </p>
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
