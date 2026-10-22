'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Activity, CalendarClock, MonitorCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError, FormField } from '@/components/ui/form'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Dither } from '@/components/visual/dither'
import { Lockup } from '@/components/visual/lockup'
import { Mark } from '@/components/visual/mark'
import { Window } from '@/components/visual/window'

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
    <main className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_520px]">
      {/*
        Брендовая половина.
        На узком экране её нет: там каждый пиксель по вертикали занят формой,
        и вводный текст отодвигает поля ввода за пределы первого экрана.
      */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border p-10 lg:flex xl:p-14">
        {/* Сцена живёт справа внизу: кристаллы растут от нижнего края и не
            спорят с текстом. К левому краю сцена растворяется маской, чтобы
            список возможностей оставался на чистом фоне. */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 h-[74%] w-[40%] [mask-image:radial-gradient(ellipse_at_bottom_right,#000_18%,transparent_78%)]"
        >
          <Dither scene="crystals" focus={0.55} cell={2} />
        </div>

        <div className="relative flex items-center justify-between">
          <Lockup size={22} />
          <span className="font-mono text-[9px] tracking-[0.14em] text-text-subtle uppercase">
            Digital signage
          </span>
        </div>

        <div className="relative max-w-[520px]">
          <p className="section-title mb-5">[01] Публикация</p>

          <h2 className="max-w-[17ch] text-[clamp(1.75rem,1.2rem+1.5vw,2.5rem)] leading-[1.06] font-medium tracking-[-0.035em] text-balance">
            Контент на экранах. <em>С подтверждением доставки.</em>
          </h2>

          <p className="mt-4 max-w-[46ch] text-[13.5px] leading-relaxed text-text-muted">
            Публикация, расписание и состояние телевизоров сети в одном месте — без звонков
            «а у нас точно обновилось?».
          </p>

          <ul className="mt-10 flex flex-col">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon

              return (
                <li
                  key={feature.title}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 border-t border-border py-4"
                >
                  <span className="font-mono text-[10px] leading-5 text-text-subtle">
                    [{String(index + 1).padStart(2, '0')}]
                  </span>

                  <div>
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5 shrink-0 text-primary" strokeWidth={1.6} />
                      <span className="text-[13px] font-medium text-text">{feature.title}</span>
                    </div>
                    <p className="mt-1 max-w-[44ch] text-[12px] leading-relaxed text-text-muted">
                      {feature.text}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 font-mono text-[9px] tracking-[0.12em] text-text-subtle uppercase">
          <Mark size={12} className="text-primary" />
          Управление цифровыми экранами · 2026
        </div>
      </section>

      <section className="relative flex flex-col justify-center px-5 py-14 sm:px-10">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-[360px] fade-in">
          <div className="mb-8 lg:hidden">
            <Lockup size={22} chip={null} />
          </div>

          <p className="section-title mb-3">Вход</p>
          <h1 className="text-[24px] leading-tight font-medium tracking-[-0.032em]">
            Вход в панель
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-text-muted">
            Войдите, чтобы управлять экранами сети
          </p>

          <Window title="auth" className="mt-7" bodyClassName="p-5">
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
          </Window>

          {/* Регистрация открыта не только по приглашению: владелец может
              создать сеть сам, и ссылка должна называть это действие. */}
          <p className="mt-5 text-center text-[12.5px] text-text-muted">
            Нужна своя сеть?{' '}
            <Link
              href="/register"
              className="font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary-hover hover:decoration-primary-hover"
            >
              Создать сеть
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
