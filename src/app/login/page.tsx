'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Activity, CalendarClock, MonitorCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { FormError, FormField } from '@/components/ui/form'
import { ThemeToggle } from '@/components/ui/theme-toggle'

/**
 * Что даёт панель.
 *
 * Список описывает только то, что действительно есть: доставка подтверждается
 * экраном, расписание считается по филиалам, события связи попадают в журнал.
 * Никаких «тысяч экранов» и «99,9%» — числа, которые нельзя проверить на этом
 * же экране, читаются как реклама и подрывают доверие к остальному.
 */
const FEATURES = [
  {
    icon: MonitorCheck,
    title: 'Доставка подтверждена экраном',
    text: 'Экран сам сообщает, что файл скачан и поставлен в очередь, — а не сервер отмечает «отправлено».',
  },
  {
    icon: CalendarClock,
    title: 'Расписание и кампании',
    text: 'Что и когда идёт на конкретном филиале или группе экранов, с приоритетами при пересечении.',
  },
  {
    icon: Activity,
    title: 'Связь и журнал действий',
    text: 'Видно, какие экраны на связи, когда пропадали и кто что менял в панели.',
  },
]

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
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_480px]">
      {/*
        Брендовая половина.
        На узком экране её нет: там каждый пиксель по вертикали занят формой,
        и вводный текст отодвигает поля ввода за пределы первого экрана.
      */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface-rail p-10 lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_10%_0%,var(--surface-3),transparent_65%)]"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-text shadow-[var(--shadow-xs)]">
            <MonitorCheck className="size-[17px]" strokeWidth={1.9} />
          </span>
          <div className="leading-none">
            <div className="text-[14px] font-semibold tracking-[-0.02em]">SHAWTY</div>
            <div className="mt-1 text-[10.5px] text-text-subtle">Экранная сеть</div>
          </div>
        </div>

        <div className="relative max-w-[520px]">
          <h2 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.035em] text-balance">
            Контент на экранах — с подтверждением доставки
          </h2>
          <p className="mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-text-muted">
            Публикация, расписание и состояние телевизоров сети в одном месте — без звонков «а у нас
            точно обновилось?».
          </p>

          <ul className="mt-9 flex flex-col gap-5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon

              return (
                <li key={feature.title} className="flex gap-3.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface text-text-muted">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <div>
                    <div className="text-[13px] font-medium">{feature.title}</div>
                    <p className="mt-0.5 max-w-[44ch] text-[12.5px] leading-relaxed text-text-muted">
                      {feature.text}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="relative text-[11.5px] text-text-subtle">Управление цифровыми экранами</div>
      </section>

      <section className="relative flex flex-col justify-center px-5 py-14 sm:px-10">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-[340px] fade-in">
          <div className="mb-7 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-text shadow-[var(--shadow-xs)]">
              <MonitorCheck className="size-[17px]" strokeWidth={1.9} />
            </span>
          </div>

          <h1 className="text-[21px] leading-tight font-semibold tracking-[-0.028em]">Вход в панель</h1>
          <p className="mt-1.5 text-[13px] text-text-muted">Войдите, чтобы управлять экранами сети</p>

          <Card className="mt-6 shadow-[var(--shadow-sm)]">
            <CardBody className="p-5">
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
            <Link
              href="/register"
              className="font-medium text-text underline underline-offset-4 transition-colors hover:text-text-muted"
            >
              Создать учётную запись
            </Link>
          </p>
        </div>
      </section>
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
