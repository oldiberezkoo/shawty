import type { Metadata } from 'next'
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
  const invited = Boolean(token)

  return (
    <AuthShell
      title={invited ? 'Создание учётной записи' : 'Создание сети'}
      description={
        invited
          ? 'Заполните данные — и сразу попадёте в компанию, которая вас пригласила.'
          : 'Назовите сеть и создайте владельца — панель откроется сразу, а тариф выберете на первом входе.'
      }
    >
      <RegisterForm token={token ?? ''} />
    </AuthShell>
  )
}
