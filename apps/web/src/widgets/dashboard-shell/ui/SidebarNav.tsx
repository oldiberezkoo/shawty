'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  CalendarClock,
  ChevronRight,
  Images,
  LayoutDashboard,
  ListMusic,
  LogOut,
  Megaphone,
  Menu,
  MonitorSmartphone,
  Network,
  ScrollText,
  Send,
  Tv,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Mark } from '@/components/visual/mark'

export type NavItem = {
  href: string
  label: string
  /** Иконка — обязательна: подпись без знака не читается в списке. */
  icon: typeof LayoutDashboard
  ready: boolean
}

export type NavGroup = { title: string; items: NavItem[] }

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Навигация.
 *
 * Боковая колонка, а не строка ссылок в шапке: одиннадцать пунктов в одну
 * строку не помещаются ни на каком экране, и на телефоне строка превращается
 * в кашу из обрезанных подписей, где половину пунктов не видно и не найти.
 *
 * Колонка следует приёму дизайн-системы: разделы пронумерованы, у активного
 * пункта есть и заливка, и акцентная полоса слева — по одному признаку
 * активность читается плохо, особенно людям с нарушениями зрения.
 */
export function SidebarNav({
  groups,
  companyName,
  roleLabel,
  userName,
  onSignOut,
}: {
  groups: NavGroup[]
  companyName: string
  roleLabel: string
  userName: string
  onSignOut: () => void
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pt-1 pb-4">
        {groups.map((group, groupIndex) => (
          <div key={group.title} className="flex flex-col">
            <div className="flex items-center gap-2 px-2.5 pt-1 pb-2 font-mono text-[9.5px] tracking-[0.1em] text-text-subtle uppercase">
              <span className="text-text-subtle/70">[{String(groupIndex + 1).padStart(2, '0')}]</span>
              {group.title}
            </div>

            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
      </div>

      {/* Код на телевизоре — самый частый первый шаг. Ссылка стоит в колонке,
          чтобы не искать «Подключить экран» по странице настроек. */}
      <div className="px-3 pb-3">
        <Link
          href="/pair"
          className="group flex items-center gap-3 border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-2"
        >
          <span className="flex size-8 shrink-0 items-center justify-center border border-border-strong text-primary">
            <Tv className="size-4" strokeWidth={1.6} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium text-text">Подключить экран</span>
            <span className="mt-0.5 block font-mono text-[9px] leading-snug tracking-[0.05em] text-text-subtle uppercase">
              Код на телевизоре — и экран в сети
            </span>
          </span>

          <ChevronRight
            className="size-3.5 shrink-0 text-text-subtle transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.8}
          />
        </Link>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center border border-border-strong font-mono text-[10px] text-text-muted">
            {initials(userName) || '—'}
          </span>

          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-medium">{userName}</div>
            <div className="mt-1 truncate font-mono text-[9px] tracking-[0.05em] text-text-subtle uppercase">
              {companyName} · {roleLabel}
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Выйти"
            title="Выйти"
            className="flex size-8 items-center justify-center border border-transparent text-text-subtle transition-colors hover:border-border-strong hover:text-text"
          >
            <LogOut className="size-4" strokeWidth={1.7} />
          </button>
        </div>
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
        className="flex h-9 cursor-not-allowed items-center gap-2.5 px-2.5 text-[13px] text-text-subtle"
      >
        <Icon className="size-[17px] shrink-0" strokeWidth={1.6} />
        {item.label}
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex h-9 items-center gap-2.5 px-2.5 text-[13px] transition-colors duration-100 ${
        active ? 'bg-surface text-text' : 'text-text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      {/* Полоска слева дублирует заливку: одного фона мало, когда разница
          между «выбран» и «наведён» почти незаметна. */}
      {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] bg-primary" /> : null}

      <Icon
        className={`size-[17px] shrink-0 transition-colors ${
          active ? 'text-primary' : 'text-text-subtle group-hover:text-text-muted'
        }`}
        strokeWidth={1.6}
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

      <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-border-strong bg-bg motion-safe:animate-[slide-in_200ms_steps(6,end)]">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <BrandMark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть меню"
            className="flex size-8 items-center justify-center text-text-subtle transition-colors hover:text-text"
          >
            <X className="size-4" strokeWidth={1.7} />
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
      className="-ml-1 flex size-9 items-center justify-center border border-border-strong text-text-muted transition-colors hover:border-text hover:text-text md:hidden"
    >
      <Menu className="size-4" strokeWidth={1.7} />
    </button>
  )
}

/**
 * Знак продукта.
 *
 * Кристалл и акцентная плита вместо иконки в синем квадрате: в колонке из
 * одиннадцати текстовых строк логотип-надпись сливается с пунктами, и верх
 * перестаёт читаться как «здесь начало».
 */
export function BrandMark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <Mark size={22} className="shrink-0 text-primary" />

      <span className="flex flex-col gap-1 leading-none">
        <span
          translate="no"
          className="w-fit bg-primary px-[5px] py-px font-sans text-[15px] leading-[1.2] font-medium tracking-[-0.01em] text-primary-text uppercase"
        >
          SHAWTY
        </span>
        <span className="font-mono text-[8.5px] tracking-[0.14em] text-text-subtle uppercase">
          Экранная сеть
        </span>
      </span>
    </Link>
  )
}

/** Набор разделов. Живёт здесь, чтобы страница и колонка читали одно. */
export const NAV: NavGroup[] = [
  {
    title: 'Сеть',
    items: [
      { href: '/dashboard', label: 'Обзор', icon: LayoutDashboard, ready: true },
      { href: '/dashboard/screens', label: 'Экраны', icon: MonitorSmartphone, ready: true },
      { href: '/dashboard/structure', label: 'Структура', icon: Network, ready: true },
      { href: '/dashboard/monitoring', label: 'Мониторинг', icon: Activity, ready: true },
    ],
  },
  {
    title: 'Контент',
    items: [
      { href: '/dashboard/media', label: 'Медиатека', icon: Images, ready: true },
      { href: '/dashboard/playlists', label: 'Плейлисты', icon: ListMusic, ready: true },
      { href: '/dashboard/campaigns', label: 'Кампании', icon: Megaphone, ready: true },
      { href: '/dashboard/scheduling', label: 'Расписание', icon: CalendarClock, ready: true },
      { href: '/dashboard/releases', label: 'Публикация', icon: Send, ready: true },
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
