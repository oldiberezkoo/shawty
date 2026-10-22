import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ui/auth-shell'
import { requireSession } from '@/server/auth/require-session'
import { CompanyForm } from './CompanyForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Создание сети' }

/**
 * Сеть для аккаунта без компании.
 *
 * Сюда попадает не только «старый» пользователь, зарегистрированный до
 * появления названия сети, но и любой, у кого членство отозвали: вместо
 * петли «вошёл → нет компании → войди снова» человек видит один понятный шаг.
 */
export default async function OnboardingPage() {
  const session = await requireSession()

  if (session.companies.length > 0) {
    redirect('/dashboard')
  }

  return (
    <AuthShell
      title="Создайте сеть"
      description={`Учётная запись «${session.email}» готова. Осталось назвать сеть — и можно подключать экраны.`}
    >
      <CompanyForm />
    </AuthShell>
  )
}
