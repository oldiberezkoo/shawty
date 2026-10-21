import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/ui/auth-shell'
import { InviteAccept } from './InviteAccept'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Приглашение' }

/**
 * Страница приглашения.
 *
 * Открывается по одноразовой ссылке из письма, поэтому обязана работать и без
 * входа: иначе человек сначала зарегистрируется, потом вспомнит про ссылку —
 * и потеряет её.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  return (
    <AuthShell
      title="Приглашение в компанию"
      description="Проверьте, в какую компанию вас приглашают, и примите приглашение."
      width="md"
      footer={
        <>
          Передумали?{' '}
          <Link
            href="/login"
            className="font-medium text-text underline underline-offset-4 transition-colors hover:text-text-muted"
          >
            Вернуться к входу
          </Link>
        </>
      }
    >
      <InviteAccept token={token ?? ''} />
    </AuthShell>
  )
}
