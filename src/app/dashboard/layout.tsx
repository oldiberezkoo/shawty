import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireSession } from '@/server/auth/require-session'
import { ROLE_LABELS } from '@/domain/authz/permissions'
import { getSubscription } from '@/server/services/billing-service'
import { AppShell } from './AppShell'

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
    redirect('/login?error=no_company')
  }

  const membership = session.companies[0]
  const subscription = membership ? getSubscription(membership.companyId) : null

  async function signOut() {
    'use server'

    const { clearAuthCookies, readSessionCookie } = await import('@/server/http/cookies')
    const { loadSessionContext, revokeSession } = await import('@/server/services/auth-service')

    const token = await readSessionCookie()

    if (token) {
      const context = loadSessionContext(token)
      if (context) revokeSession(context.sessionId)
    }

    await clearAuthCookies()
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