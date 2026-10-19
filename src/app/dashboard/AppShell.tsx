'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { SidebarNav, SidebarSheet, SidebarTrigger, NAV } from './SidebarNav'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Toaster } from '@/components/ui/feedback'

/**
 * Каркас панели.
 *
 * Держит три вещи, которые не могут жить на сервере: открытость колонки на
 * телефоне, переключение темы и показ сообщений поверх всего. Остальное —
 * ссылки и данные — приходит готовым.
 *
 * Выход сделан через `action` серверного компонента: форма с серверным
 * действием работает без JavaScript, а клиентский обработчик, дёргающий
 * `fetch`, оставлял бы пользователя на странице, если скрипт не загрузился.
 */
export function AppShell({
  children,
  companyName,
  roleLabel,
  userName,
  notice,
  signOut,
}: {
  children: ReactNode
  companyName: string
  roleLabel: string
  userName: string
  notice: { tone: 'warn' | 'danger'; title: string; hint: string } | null
  signOut: () => Promise<void>
}) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col bg-bg md:flex-row">
      {/*
        Колонка видна постоянно на широком экране и выезжает поверх на
        узком. Одни и те же пункты в обоих случаях — иначе набор разделов
        начнёт расходиться между экранами, что и происходит в приложениях,
        где мобильную версию делают отдельно и забывают про новые разделы.
      */}
      <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 border-r border-border bg-surface md:block">
        <div className="flex h-14 items-center px-4">
          <Link href="/dashboard" className="text-[15px] font-semibold tracking-[-0.02em]">
            SHAWTY
          </Link>
        </div>

        <SidebarNav
          groups={NAV}
          companyName={companyName}
          roleLabel={roleLabel}
          userName={userName}
          onSignOut={signOut}
        />
      </aside>

      <SidebarSheet
        groups={NAV}
        companyName={companyName}
        roleLabel={roleLabel}
        userName={userName}
        onSignOut={signOut}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <SidebarTrigger onOpen={() => setNavOpen(true)} />

            <Link href="/dashboard" className="text-[15px] font-semibold tracking-[-0.02em] md:hidden">
              SHAWTY
            </Link>

            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>

        {notice ? (
          // Предупреждение о подписке живёт над всем: человек должен увидеть
          // его до того, как начнёт планировать кампанию, которой хватит
          // приостановки на середине.
          <div
            className={`border-b px-4 py-2.5 md:px-6 ${
              notice.tone === 'danger' ? 'border-danger-border bg-danger-bg' : 'border-warn-border bg-warn-bg'
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 text-[13px] ${
                notice.tone === 'danger' ? 'text-danger' : 'text-warn'
              }`}
            >
              <span>
                <span className="font-medium">{notice.title}.</span>{' '}
                <span className="opacity-90">{notice.hint}</span>
              </span>
              <Link href="/dashboard/billing" className="shrink-0 font-medium underline underline-offset-4">
                К тарифу
              </Link>
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>

      <Toaster />
    </div>
  )
}