'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  Clapperboard,
  Images,
  LayoutDashboard,
  ListMusic,
  LogOut,
  Megaphone,
  Menu,
  MonitorSmartphone,
  ScrollText,
  Send,
  Users,
  Wallet,
  X,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  /** Иконка — обязательна: подпись без знака не читается в списке. */
  icon: typeof LayoutDashboard
  ready: boolean
}

export type NavGroup = { title: string; items: NavItem[] }

/**
 * Навигация.
 *
 * Боковая колонка, а не строка ссылок в шапке: одиннадцать пунктов в одну
 * строку не помещаются ни на каком экране, и на телефоне строка превращается
 * в кашу из обрезанных подписей, где половину пунктов не видно и не найти.
 *
 * Колонка повторяет приём shadcn/ui и Notion: разделы сгруппированы, у
 * активного пункта есть и заливка, и цвет текста — по одному признаку
 * активность читается плохо, особенно людям с нарушениями зрения.
 */
export function SidebarNav({ groups, companyName, roleLabel, userName, onSignOut }: {
  groups: NavGroup[]
  companyName: string
  roleLabel: string
  userName: string
  onSignOut: () => void
}) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-text-subtle uppercase">
              {group.title}
            </div>

            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-border px-3 py-3">
        <div className="px-2 pb-2">
          <div className="truncate text-[13px] font-medium">{userName}</div>
          <div className="truncate text-[11.5px] text-text-subtle">
            {companyName} · {roleLabel}
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <LogOut className="size-4 shrink-0" strokeWidth={1.75} />
          Выйти
        </button>
      </div>
    </div>
  )
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const Icon = item.icon

  // Активным считается и сам раздел, и всё, что внутри него: у «Экранов» нет
  // вложенных страниц, но у «Публикации» есть, и без этого подсветка гаснет
  // при переходе внутрь.
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(`${item.href}/`))

  if (!item.ready) {
    return (
      <span
        aria-disabled
        title="Раздел появится в следующих этапах"
        className="flex cursor-not-allowed items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] text-text-subtle"
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.75} />
        {item.label}
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] transition-colors ${
        active
          ? 'bg-surface-2 font-medium text-text'
          : 'text-text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      <Icon
        className={`size-4 shrink-0 transition-colors ${active ? 'text-text' : 'text-text-subtle group-hover:text-text-muted'}`}
        strokeWidth={1.75}
      />
      {item.label}
    </Link>
  )
}

/**
 * Колонка на узком экране.
 *
 * Выезжает поверх страницы, а не сдвигает её: сдвиг ломает позиционирование
 * открытой формы и вызывает прыжок всей вёрстки при каждом открытии.
 */
export function SidebarSheet({
  groups,
  companyName,
  roleLabel,
  userName,
  onSignOut,
  open,
  onClose,
}: {
  groups: NavGroup[]
  companyName: string
  roleLabel: string
  userName: string
  onSignOut: () => void
  open: boolean
  onClose: () => void
}) {
  // Пока колонка открыта, страница под ней не должна прокручиваться: иначе
  // содержимое уезжает из-под меню и закрыть его можно только наугад.
  useEffect(() => {
    if (!open) return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Закрыть меню"
        onClick={onClose}
        className="absolute inset-0 bg-overlay backdrop-blur-[2px] motion-safe:animate-[fade-in_150ms_ease-out]"
      />

      <div className="absolute inset-y-0 left-0 flex w-[272px] flex-col border-r border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <span className="text-[15px] font-semibold tracking-[-0.02em]">SHAWTY</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть меню"
            className="rounded-[var(--radius-sm)] p-1 text-text-subtle transition-colors hover:bg-surface-2 hover:text-text"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <SidebarNav
          groups={groups}
          companyName={companyName}
          roleLabel={roleLabel}
          userName={userName}
          onSignOut={() => {
            onClose()
            onSignOut()
          }}
        />
      </div>
    </div>
  )
}

/** Кнопка, открывающая колонку. Видна только на узком экране. */
export function SidebarTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Открыть меню"
      className="-ml-1 rounded-[var(--radius-md)] p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text md:hidden"
    >
      <Menu className="size-5" strokeWidth={1.75} />
    </button>
  )
}

/** Набор разделов. Живёт здесь, чтобы страница и колонка читали одно. */
export const NAV: NavGroup[] = [
  {
    title: 'Сеть',
    items: [
      { href: '/dashboard', label: 'Обзор', icon: LayoutDashboard, ready: true },
      { href: '/dashboard/screens', label: 'Экраны', icon: MonitorSmartphone, ready: true },
      { href: '/dashboard/monitoring', label: 'Мониторинг', icon: Send, ready: true },
    ],
  },
  {
    title: 'Контент',
    items: [
      { href: '/dashboard/media', label: 'Медиатека', icon: Images, ready: true },
      { href: '/dashboard/playlists', label: 'Плейлисты', icon: ListMusic, ready: true },
      { href: '/dashboard/campaigns', label: 'Кампании', icon: Megaphone, ready: true },
      { href: '/dashboard/scheduling', label: 'Расписание', icon: CalendarClock, ready: true },
      { href: '/dashboard/releases', label: 'Публикация', icon: Clapperboard, ready: true },
    ],
  },
  {
    title: 'Компания',
    items: [
      { href: '/dashboard/team', label: 'Команда', icon: Users, ready: true },
      { href: '/dashboard/billing', label: 'Тариф', icon: Wallet, ready: true },
      { href: '/dashboard/audit', label: 'Журнал', icon: ScrollText, ready: true },
    ],
  },
]

