import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/server/auth/require-session'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ROLE_LABELS } from '@/domain/authz/permissions'

type NavItem = { href: string; label: string; ready: boolean }

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Обзор', ready: true },
  { href: '/dashboard/screens', label: 'Экраны', ready: true },
  { href: '/dashboard/media', label: 'Медиатека', ready: true },
  { href: '/dashboard/playlists', label: 'Плейлисты', ready: true },
  { href: '/dashboard/releases', label: 'Публикация', ready: true },
  { href: '/dashboard/campaigns', label: 'Кампании', ready: true },
  { href: '/dashboard/scheduling', label: 'Расписание', ready: true },
  { href: '/dashboard/monitoring', label: 'Мониторинг', ready: true },
  { href: '/dashboard/audit', label: 'Журнал', ready: true },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  if (session.companies.length === 0) {
    redirect('/login?error=no_company')
  }

  const membership = session.companies[0]

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-6 px-6">
          <Link href="/dashboard" className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-[-0.02em]">SHAWTY</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((item) =>
              item.ready ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.href}
                  aria-disabled
                  title="Раздел появится в следующих этапах"
                  className="cursor-not-allowed rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13px] text-text-subtle"
                >
                  {item.label}
                </span>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <div className="text-[13px] leading-tight">{session.name}</div>
              <div className="text-[11px] leading-tight text-text-subtle">
                {ROLE_LABELS[membership?.role ?? 'viewer']}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1180px] flex-1 px-6 py-8">{children}</div>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-6 py-4 text-[12px] text-text-subtle">
          <span>{membership?.companyName}</span>
          <LogoutButton />
        </div>
      </footer>
    </div>
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
      <button type="submit" className="hover:text-text transition-colors">
        Выйти
      </button>
    </form>
  )
}
