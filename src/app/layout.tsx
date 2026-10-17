import type { Metadata, Viewport } from 'next'
import './globals.css'

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
    { media: '(prefers-color-scheme: dark)', color: '#17181a' },
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
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  )
}
