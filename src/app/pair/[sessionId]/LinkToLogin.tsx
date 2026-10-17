import Link from 'next/link'

/** Ссылка «назад в панель» на странице подтверждения. */
export function LinkToLogin({ href, children = '← Вернуться в панель' }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] text-text-muted transition-colors hover:text-text">
      {children}
    </Link>
  )
}
