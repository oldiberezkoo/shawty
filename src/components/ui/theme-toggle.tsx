'use client'

import { useEffect, useState } from 'react'

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
      className="inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
    >
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.95 3.05l-1.13 1.13M4.18 11.82l-1.13 1.13M12.95 12.95l-1.13-1.13M4.18 4.18 3.05 3.05"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.9 5.9 0 1 0 7.1 7.1Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
