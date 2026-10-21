import Link from 'next/link'

/** Ссылка «назад в панель» на странице подтверждения. */
export function LinkToLogin({ href, children = '← Вернуться в панель' }: { href: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-text-muted uppercase transition-colors hover:text-text"
    >
      {children}
    </Link>
  )
}
