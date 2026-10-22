import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, SESSION_COOKIE } from '@shawty/contracts'
import { requireSession } from '@/server/auth/require-session'
import { ROLE_LABELS } from '@/domain/authz/permissions'
import { apiGet, apiSend } from '@/server/api'
import { AppShell } from '@/widgets/dashboard-shell/ui/AppShell'

export const dynamic = 'force-dynamic'

/**
 * Каркас панели.
 *
 * Здесь только данные и выход: сам каркас клиентский, потому что держит
 * открытость колонки на телефоне и сообщения поверх страницы. Всё, что можно
 * посчитать на сервере, считается на сервере — иначе первый экран ждёт
 * загрузки там, где данные уже были на руках.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()

  if (session.companies.length === 0) {
    // Сессия валидна, но компании нет — это не повод отправлять на вход:
    // пароль верный, а создать сеть в интерфейсе входа негде. Онбординг
    // доводит аккаунт до рабочего состояния.
    redirect('/onboarding')
  }

  const membership = session.companies[0]
  const subscription = membership
    ? await apiGet<{ notice: { tone: 'warn' | 'danger'; title: string; hint: string } | null }>(
        '/api/dashboard/subscription',
        membership.companyId,
      )
    : null

  async function signOut() {
    'use server'

    const store = await cookies()
    const csrf = store.get(CSRF_COOKIE)?.value

    try {
      await apiSend('/api/auth/logout', { method: 'POST', csrfToken: csrf })
    } catch {
      // Сессии могло уже не быть: выход всё равно должен увести на вход.
    }

    store.delete(SESSION_COOKIE)
    store.delete(CSRF_COOKIE)
    redirect('/login')
  }

  return (
    <AppShell
      companyName={membership?.companyName ?? ''}
      roleLabel={membership ? ROLE_LABELS[membership.role] : ''}
      userName={session.name}
      notice={subscription?.notice ?? null}
      signOut={signOut}
    >
      {children}
    </AppShell>
  )
}