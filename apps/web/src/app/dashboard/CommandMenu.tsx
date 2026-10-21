'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { CornerDownLeft, Search } from 'lucide-react'
import { NAV } from './SidebarNav'

const ALL_ITEMS = NAV.flatMap((group) =>
  group.items
    .filter((item) => item.ready)
    .map((item) => ({ ...item, group: group.title })),
)

/**
 * Поиск по разделам.
 *
 * Одиннадцать пунктов в колонке приходится просматривать глазами, а привычка
 * «набрать название» у людей из SaaS-инструментов уже есть. Здесь поиск ведёт
 * только по разделам панели: он не обещает искать экраны или файлы и не
 * притворяется глобальным поиском, которого пока нет.
 */
export function CommandMenu() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [shortcut, setShortcut] = useState('Ctrl K')

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcut('⌘K')
  }, [])

  // Горячая клавиша работает из любого места панели: искать раздел через
  // колонку — это тот же путь, только длиннее.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // При открытии показываем весь список и ставим курсор в поле. Иначе
  // диалог открывается с прошлым запросом и пустым результатом.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return ALL_ITEMS

    return ALL_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle),
    )
  }, [query])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(items.length - 1, index + 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
      return
    }

    if (event.key === 'Enter') {
      const item = items[active]
      if (item) {
        event.preventDefault()
        go(item.href)
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-[210px] items-center gap-2 border border-border-strong bg-transparent px-3 text-[12px] text-text-subtle transition-colors hover:border-text hover:text-text-muted lg:flex"
      >
        <Search className="size-3.5 shrink-0" strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-left">Найти раздел…</span>
        <kbd className="shrink-0 border border-border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.04em] text-text-subtle">
          {shortcut}
        </kbd>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Найти раздел"
        className="flex size-9 items-center justify-center border border-border-strong text-text-muted transition-colors hover:border-text hover:text-text lg:hidden"
      >
        <Search className="size-4" strokeWidth={1.8} />
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-overlay backdrop-blur-[3px] transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />

          <Dialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[12vh]">
            <Dialog.Popup className="w-full max-w-[540px] overflow-hidden border border-border-strong bg-bg transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
              <Dialog.Title className="sr-only">Поиск по разделам</Dialog.Title>

              {/* Титульная строка окна: та же, что у диалогов и плеера. */}
              <div className="flex items-center gap-3 border-b border-border px-3 py-2">
                <span className="bg-primary px-1 py-px font-sans text-[10px] leading-[1.35] font-medium text-primary-text uppercase">
                  SHAWTY
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.04em] text-text-subtle uppercase">
                  Поиск по разделам
                </span>
                <kbd className="shrink-0 border border-border px-1.5 py-0.5 font-mono text-[9px] text-text-subtle">
                  Esc
                </kbd>
              </div>

              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search className="size-4 shrink-0 text-text-subtle" strokeWidth={1.8} />

                <input
                  ref={inputRef}
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- поле открылось по действию пользователя
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Название раздела…"
                  aria-label="Поиск по разделам"
                  role="combobox"
                  aria-expanded
                  aria-controls="command-list"
                  aria-activedescendant={items[active] ? `command-option-${active}` : undefined}
                  className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-subtle"
                />
              </div>

              <ul id="command-list" role="listbox" className="max-h-[320px] overflow-y-auto py-1">
                {items.map((item, index) => {
                  const Icon = item.icon
                  const selected = index === active

                  return (
                    <li
                      key={item.href}
                      id={`command-option-${index}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(item.href)}
                      className={`relative flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[13px] transition-colors ${
                        selected ? 'bg-surface text-text' : 'text-text-muted hover:bg-surface-2'
                      }`}
                    >
                      {selected ? (
                        <span aria-hidden className="absolute inset-y-1 left-0 w-[2px] bg-primary" />
                      ) : null}

                      <Icon
                        className={`size-4 shrink-0 ${selected ? 'text-primary' : 'text-text-subtle'}`}
                        strokeWidth={1.6}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                      <span className="shrink-0 font-mono text-[9px] tracking-[0.06em] text-text-subtle uppercase">
                        {item.group}
                      </span>
                    </li>
                  )
                })}

                {items.length === 0 ? (
                  <li className="px-4 py-8 text-center text-[12.5px] text-text-muted">
                    Раздел не найден. Попробуйте «экраны» или «тариф».
                  </li>
                ) : null}
              </ul>

              <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 font-mono text-[9px] tracking-[0.06em] text-text-subtle uppercase">
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="border border-border px-1 py-0.5 text-[9px]">↑↓</kbd>
                  выбрать
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CornerDownLeft className="size-3" strokeWidth={1.8} />
                  открыть
                </span>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
