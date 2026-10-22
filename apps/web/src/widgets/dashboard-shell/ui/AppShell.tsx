'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, CircleAlert, TriangleAlert } from 'lucide-react'
import { BrandMark, SidebarNav, SidebarSheet, SidebarTrigger, NAV } from './SidebarNav'
import { CommandMenu } from './CommandMenu'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Toaster } from '@/components/ui/feedback'
import { Mark } from '@/components/visual/mark'

/**
 * Каркас панели.
 *
 * Держит три вещи, которые не могут жить на сервере: открытость колонки на
 * телефоне, подсветку текущего раздела и показ сообщений поверх всего.
 * Остальное — ссылки и данные — приходит готовым.
 *
 * Колонка и шапка живут на фоне страницы, а не на приподнятой поверхности:
 * на near-black лишний слой поверхностей превращается в матрёшку. Разделение
 * делают только hairline.
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
  const pathname = usePathname()

  // Текущий раздел для строки навигации в шапке. Ищется по тому же списку,
  // что рисует колонка: отдельная таблица названий разошлась бы с меню на
  // первом же переименовании.
  const currentGroup = NAV.find((group) =>
    group.items.some((item) => item.href === pathname || (item.href !== '/dashboard' && pathname?.startsWith(`${item.href}/`))),
  )
  const currentItem = currentGroup?.items.find(
    (item) => item.href === pathname || (item.href !== '/dashboard' && pathname?.startsWith(`${item.href}/`)),
  )

  return (
    <div className="flex min-h-dvh flex-col bg-bg md:flex-row">
      {/*
        Колонка видна постоянно на широком экране и выезжает поверх на
        узком. Одни и те же пункты в обоих случаях — иначе набор разделов
        начнёт расходиться между экранами, что и происходит в приложениях,
        где мобильную версию делают отдельно и забывают про новые разделы.
      */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-border bg-bg md:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <BrandMark />
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
        <header className="sticky top-0 z-40 border-b border-border bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-8">
            <SidebarTrigger onOpen={() => setNavOpen(true)} />

            <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
              <Mark size={16} className="shrink-0 text-primary" />
              <span className="text-[13px] font-medium tracking-[0.04em] uppercase">SHAWTY</span>
            </Link>

            {/*
              Где я нахожусь. Колонка подсвечивает пункт, но на узком экране
              она скрыта, а после перехода по прямой ссылке человек не всегда
              помнит, куда попал. Строка стоит копейки и убирает этот вопрос.
            */}
            {currentItem && currentGroup ? (
              <div className="hidden min-w-0 items-center gap-2 font-mono text-[10px] tracking-[0.06em] text-text-subtle uppercase md:flex">
                <span className="text-text-subtle">{currentGroup.title}</span>
                <ChevronRight className="size-3 shrink-0" strokeWidth={1.6} />
                <span className="truncate text-text">{currentItem.label}</span>
              </div>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              <CommandMenu />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {notice ? (
          // Предупреждение о подписке живёт над всем: человек должен увидеть
          // его до того, как начнёт планировать кампанию, которой хватит
          // приостановки на середине.
          <div
            className={`border-b border-l-[3px] px-4 py-2.5 md:px-8 ${
              notice.tone === 'danger'
                ? 'border-text border-l-bg bg-text text-bg'
                : 'border-border border-l-text-muted bg-surface-2 text-text'
            }`}
          >
            <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2 text-[12px]">
              <span className="flex items-start gap-2">
                {notice.tone === 'danger' ? (
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.7} />
                ) : (
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.7} />
                )}
                <span>
                  <span className="font-medium">{notice.title}.</span>{' '}
                  <span className="opacity-80">{notice.hint}</span>
                </span>
              </span>
              <Link
                href="/dashboard/billing"
                className="shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase underline underline-offset-4"
              >
                К тарифу
              </Link>
            </div>
          </div>
        ) : null}

        {/*
          Ширина ограничена. На мониторе 2560px таблица из шести колонок,
          растянутая во всю ширину, заставляет водить глазами на полметра
          между названием экрана и его состоянием — связи между ними уже не
          видно. 1280px — предел, за которым строки перестают читаться как
          строки.
        */}
        <main className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="motion-safe:animate-[fade-in_200ms_cubic-bezier(0.16,1,0.3,1)]">{children}</div>
        </main>
      </div>

      <Toaster />
    </div>
  )
}
