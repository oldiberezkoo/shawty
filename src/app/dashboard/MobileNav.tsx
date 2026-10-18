'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export type MobileNavItem = { href: string; label: string; ready: boolean }
export type MobileNavGroup = { title: string; items: MobileNavItem[] }

/**
 * Навигация на узком экране.
 *
 * Один переключатель вместо горизонтальной ленты: девять разделов в один ряд на
 * телефоне превращаются в кашу из обрезанных подписей, и прокрутка вбок
 * прячет половину пунктов.
 *
 * Выпадающий список закрывается по Escape и по клику вне — иначе он остаётся
 * висеть поверх экрана и блокирует работу, а это самая частая жалоба на меню.
 */
export function MobileNav({ groups }: { groups: MobileNavGroup[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const current = groups.flatMap((group) => group.items).find((item) => item.href === pathname)

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-2.5 text-[13px] text-text transition-colors hover:bg-surface-2"
      >
        {current?.label ?? 'Разделы'}
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" className="text-text-subtle">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <>
          {/* Затемнение вне списка: клик по нему закрывает меню. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="menu"
            className="absolute top-full left-0 z-50 mt-1.5 w-56 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-md)]"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
          >
            {groups.map((group) => (
              <div key={group.title} className="border-b border-border last:border-0">
                <div className="px-3 pt-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.04em] text-text-subtle uppercase">
                  {group.title}
                </div>

                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    aria-disabled={!item.ready}
                    className={`block px-3 py-2 text-[13px] transition-colors ${
                      item.ready
                        ? item.href === pathname
                          ? 'bg-surface-2 font-medium text-text'
                          : 'text-text-muted hover:bg-surface-2 hover:text-text'
                        : 'cursor-not-allowed text-text-subtle'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}