import type { Metadata } from 'next'
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
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md fade-in">
        <div className="mb-6 text-center">
          <div className="text-[15px] font-semibold tracking-[-0.02em]">SHAWTY</div>
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">Приглашение в компанию</h1>
        </div>

        <InviteAccept token={token ?? ''} />
      </div>
    </main>
  )
}