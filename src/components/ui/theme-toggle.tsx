'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

/**
 * Переключатель темы. Значение хранится в localStorage, иначе при выборе
 * вручную тема возвращалась бы к системной при следующей загрузке.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)

    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.style.colorScheme = next

    try {
      localStorage.setItem('shawty-theme', next)
    } catch {
      // Приватный режим: тема просто не переживёт перезагрузку.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
    >
      {theme === 'dark' ? (
        <Sun className="size-4" strokeWidth={1.75} />
      ) : (
        <Moon className="size-4" strokeWidth={1.75} />
      )}
    </button>
  )
}
