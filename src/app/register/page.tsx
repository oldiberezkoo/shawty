import type { Metadata } from 'next'
import { RegisterForm } from './RegisterForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Регистрация' }

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm fade-in">
        <div className="mb-6 text-center">
          <div className="text-[15px] font-semibold tracking-[-0.02em]">SHAWTY</div>
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">Создание учётной записи</h1>
        </div>

        <RegisterForm token={token ?? ''} />
      </div>
    </main>
  )
}