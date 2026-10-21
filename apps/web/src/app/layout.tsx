import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

/**
 * Интерфейсные шрифты.
 *
 * Geist держит мелкий текст чистым, а Geist Mono — тот самый моноширинный из
 * дизайн-системы: им набраны метки, чипы, таблицы и код. Оба подключаются с
 * `cyrillic`: без него русский текст падал бы на системный шрифт, и половина
 * интерфейса выглядела бы иначе, чем вторая.
 */
const geistSans = Geist({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-geist-sans',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
})

const geistMono = Geist_Mono({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-geist-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
})

export const metadata: Metadata = {
  title: {
    default: 'SHAWTY — управление цифровыми экранами',
    template: '%s · SHAWTY',
  },
  description:
    'Публикация контента на телевизоры с подтверждением фактической доставки и контролем результата.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Плеер на телевизоре: масштабирование пользователем не нужно и только мешает.
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

/**
 * Тема применяется до первой отрисовки, иначе тёмная тема моргает белым.
 * Скрипт намеренно инлайновый и синхронный: внешний файл не успевает загрузиться.
 *
 * Тема следует системной настройке, пока пользователь не выбрал её вручную:
 * «Авто» хранится как пустая строка, а не как случайно зафиксированный выбор.
 */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('shawty-theme');
    var dark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  )
}
