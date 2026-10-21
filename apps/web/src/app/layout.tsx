import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

/**
 * Интерфейсный шрифт.
 *
 * Системный шрифт на Windows — Segoe UI, и он заметно грубее на мелких
 * размерах: цифры разной ширины, плотные межбуквенные просветы, тонкие
 * начертания слипаются. Inter держит мелкий текст чистым и одинаково
 * выглядит на всех платформах, поэтому панель не зависит от того, чей
 * компьютер её открыл.
 *
 * `cyrillic` подключён отдельно: без него кириллица падала на системный
 * шрифт, и половина интерфейса выглядела иначе, чем вторая.
 */
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
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
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f17' },
  ],
}

/**
 * Тема применяется до первой отрисовки, иначе тёмная тема моргает белым.
 * Скрипт намеренно инлайновый и синхронный: внешний файл не успевает загрузиться.
 */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('shawty-theme');
    var dark = stored ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  )
}
