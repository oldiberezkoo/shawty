import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/ui/auth-shell'
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
    <AuthShell
      title="Создание учётной записи"
      description="Заполните данные — после этого вы сможете войти в панель."
      footer={
        <>
          Уже есть учётная запись?{' '}
          <Link
            href="/login"
            className="font-medium text-text underline underline-offset-4 transition-colors hover:text-text-muted"
          >
            Войти
          </Link>
        </>
      }
    >
      <RegisterForm token={token ?? ''} />
    </AuthShell>
  )
}
