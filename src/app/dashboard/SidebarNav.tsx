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
  MonitorPlay,
  MonitorSmartphone,
  ScrollText,
  Send,
  Tv,
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
 * Колонка повторяет приём shadcn/ui и Notion: разделы сгруппированы, у
 * активного пункта есть и заливка, и цвет текста — по одному признаку
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
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <div className="px-3 pt-1 pb-2 text-[10.5px] font-semibold tracking-[0.1em] text-text-subtle uppercase">
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
          className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-primary-border bg-primary-soft p-3 transition-colors hover:bg-primary-soft/75"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface text-primary shadow-[var(--shadow-xs)]">
            <Tv className="size-4" strokeWidth={1.9} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-primary">Подключить экран</span>
            <span className="mt-0.5 block text-[10.5px] leading-snug text-text-muted">
              Код на телевизоре — и экран в сети
            </span>
          </span>

          <ChevronRight
            className="size-3.5 shrink-0 text-primary/60 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        </Link>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] px-1.5 py-1.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary-border bg-primary-soft text-[11px] font-semibold text-primary">
            {initials(userName) || '—'}
          </span>

          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-medium">{userName}</div>
            <div className="mt-0.5 truncate text-[10.5px] text-text-subtle">
              {companyName} · {roleLabel}
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Выйти"
            title="Выйти"
            className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-text-subtle transition-colors hover:bg-surface-2 hover:text-text"
          >
            <LogOut className="size-4" strokeWidth={1.9} />
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
        className="flex h-10 cursor-not-allowed items-center gap-3 rounded-[var(--radius-md)] px-3 text-[13.5px] text-text-subtle"
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
        {item.label}
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex h-10 items-center gap-3 rounded-[var(--radius-md)] px-3 text-[13.5px] transition-colors duration-150 ${
        active
          ? 'bg-primary-soft font-semibold text-primary'
          : 'text-text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      {/*
        Полоска слева дублирует заливку. Одного фона мало: на светлом фоне
        разница между «выбран» и «наведён» почти незаметна, и человек,
        вернувшийся к экрану, ищет себя в списке заново.
      */}
      {active ? (
        <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-primary" />
      ) : null}

      <Icon
        className={`size-[18px] shrink-0 transition-colors ${
          active ? 'text-primary' : 'text-text-subtle group-hover:text-text-muted'
        }`}
        strokeWidth={1.8}
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

      <div className="absolute inset-y-0 left-0 flex w-[284px] flex-col border-r border-border bg-surface shadow-[var(--shadow-lg)] motion-safe:animate-[slide-in_220ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <BrandMark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть меню"
            className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-text-subtle transition-colors hover:bg-surface-2 hover:text-text"
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
      className="-ml-1 flex size-9 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface text-text-muted shadow-[var(--shadow-xs)] transition-colors hover:bg-surface-2 hover:text-text md:hidden"
    >
      <Menu className="size-4.5" strokeWidth={1.8} />
    </button>
  )
}

/**
 * Знак продукта.
 *
 * Квадрат с иконкой экрана, а не просто слово: в колонке из одиннадцати
 * текстовых строк логотип-надпись сливается с пунктами, и верх перестаёт
 * читаться как «здесь начало».
 */
export function BrandMark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-text shadow-[var(--shadow-brand)]">
        <MonitorPlay className="size-4" strokeWidth={1.9} />
      </span>

      <span className="leading-none">
        <span className="block text-[14px] font-semibold tracking-[-0.025em]">SHAWTY</span>
        <span className="mt-1 block text-[10.5px] text-text-subtle">Экранная сеть</span>
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
