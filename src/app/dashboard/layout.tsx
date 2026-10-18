import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/server/auth/require-session'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ROLE_LABELS } from '@/domain/authz/permissions'
import { getSubscription } from '@/server/services/billing-service'
import { Toaster } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { MobileNav } from './MobileNav'

/**
 * Разделы панели.
 *
 * Группы не декоративны: «Сеть», «Контент» и «Компания» отвечают на три разных
 * вопроса, и человек входит в раздел по задаче, а не по памяти о том, как он
 * называется.
 *
 * `ready: false` оставляет раздел видимым, но неактивным: исчезающая навигация
 * пугает — человек думает, что функция потеряна, а её просто ещё нет.
 */
type NavItem = { href: string; label: string; ready: boolean }
type NavGroup = { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    title: 'Сеть',
    items: [
      { href: '/dashboard', label: 'Обзор', ready: true },
      { href: '/dashboard/screens', label: 'Экраны', ready: true },
      { href: '/dashboard/monitoring', label: 'Мониторинг', ready: true },
    ],
  },
  {
    title: 'Контент',
    items: [
      { href: '/dashboard/media', label: 'Медиатека', ready: true },
      { href: '/dashboard/playlists', label: 'Плейлисты', ready: true },
      { href: '/dashboard/campaigns', label: 'Кампании', ready: true },
      { href: '/dashboard/scheduling', label: 'Расписание', ready: true },
      { href: '/dashboard/releases', label: 'Публикация', ready: true },
    ],
  },
  {
    title: 'Компания',
    items: [
      { href: '/dashboard/team', label: 'Команда', ready: true },
      { href: '/dashboard/billing', label: 'Тариф', ready: true },
      { href: '/dashboard/audit', label: 'Журнал', ready: true },
    ],
  },
]

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()

  if (session.companies.length === 0) {
    redirect('/login?error=no_company')
  }

  const membership = session.companies[0]
  const subscription = membership ? getSubscription(membership.companyId) : null

  return (
    <div className="flex min-h-dvh flex-col">
      {subscription?.notice ? (
        // Предупреждение о подписке живёт над всем: человек должен увидеть
        // его до того, как начнёт планировать кампанию, которой хватит
        // приостановки на середине.
        <div className="border-b border-warn-border bg-warn-bg">
          <div className="mx-auto w-full max-w-[1320px] px-4 py-2 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-warn">
              <span>
                <span className="font-medium">{subscription.notice.title}.</span>{' '}
                <span className="opacity-90">{subscription.notice.hint}</span>
              </span>
              <Link
                href="/dashboard/billing"
                className="shrink-0 font-medium underline underline-offset-4"
              >
                К тарифу
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1320px] items-center gap-4 px-4 md:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-[-0.02em]">SHAWTY</span>
          </Link>

          <DesktopNav />
          <MobileNav groups={NAV} />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <div className="text-[13px] leading-tight">{session.name}</div>
              <div className="text-[11px] leading-tight text-text-subtle">
                {membership ? (
                  <>
                    {membership.companyName} · {ROLE_LABELS[membership.role]}
                  </>
                ) : null}
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-3 px-4 py-4 text-[12px] text-text-subtle md:px-6">
          <span className="truncate">{membership?.companyName}</span>
          <Link href="/dashboard/audit" className="shrink-0 hover:text-text transition-colors">
            Журнал действий
          </Link>
        </div>
      </footer>

      {/* Сообщения поверх всего: действие подтверждается в любом месте экрана. */}
      <Toaster />
    </div>
  )
}

/**
 * Навигация.
 *
 * На широком экране — строка групп, на узком — выпадающий список. Раньше
 * навигация была одной горизонтальной лентой, которая на телефоне превращалась
 * в кашу из обрезанных подписей.
 */
function DesktopNav() {
  return (
    <nav className="hidden min-w-0 flex-1 items-center gap-1 md:flex" aria-label="Разделы">
      {NAV.map((group) => (
        <div key={group.title} className="flex items-center gap-0.5">
          <span className="px-1.5 text-[11px] font-medium tracking-[0.03em] text-text-subtle uppercase">
            {group.title}
          </span>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      ))}
    </nav>
  )
}

function NavLink({ item }: { item: NavItem }) {
  return item.ready ? (
    <Link
      href={item.href}
      className="rounded-[var(--radius-sm)] px-2 py-1 text-[13px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {item.label}
    </Link>
  ) : (
    <span
      aria-disabled
      title="Раздел появится в следующих этапах"
      className="cursor-not-allowed px-2 py-1 text-[13px] text-text-subtle"
    >
      {item.label}
    </span>
  )
}

async function LogoutButton() {
  return (
    <form
      action={async () => {
        'use server'
        const { clearAuthCookies, readSessionCookie } = await import('@/server/http/cookies')
        const { loadSessionContext, revokeSession } = await import('@/server/services/auth-service')
        const { redirect } = await import('next/navigation')

        const token = await readSessionCookie()
        if (token) {
          const context = loadSessionContext(token)
          if (context) revokeSession(context.sessionId)
        }
        await clearAuthCookies()
        redirect('/login')
      }}
    >
      <Button type="submit" size="sm" variant="ghost">
        Выйти
      </Button>
    </form>
  )
}