import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { loadSessionContext, accessFor } from '@/server/services/auth-service'
import { readSessionCookie } from '@/server/http/cookies'
import { hasScopeAccess, ROLE_LABELS } from '@/domain/authz/permissions'
import { watchPairing } from '@/server/services/pairing-service'
import { getBranchOptions, getGroupOptions } from '@/server/services/screen-service'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { ConfirmForm } from './ConfirmForm'
import { LinkToLogin } from './LinkToLogin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Подтверждение подключения экрана',
  robots: { index: false, follow: false },
}

export default async function PairConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ c?: string }>
}) {
  const { sessionId } = await params
  const { c: codeFromQr } = await searchParams

  const token = await readSessionCookie()
  const context = token ? loadSessionContext(token) : null

  // Человек пришёл по QR без входа: отправляем на форму входа и возвращаем
  // обратно ровно на эту страницу, чтобы код не пришлось запоминать.
  if (!context) {
    redirect(`/login?returnTo=${encodeURIComponent(`/pair/${sessionId}${codeFromQr ? `?c=${codeFromQr}` : ''}`)}`)
  }

  const state = watchPairing(sessionId)

  if (state.state === 'expired') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <div className="card max-w-[420px] px-6 py-6 text-center">
          <h1 className="text-[17px] font-semibold">Срок кода истёк</h1>
          <p className="mt-2 text-[13px] text-text-muted">
            Экран показывает, что время подтверждения вышло. Включите на нём получение
            нового кода и отсканируйте QR заново.
          </p>
        </div>
      </main>
    )
  }

  if (state.state === 'confirmed') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <div className="card max-w-[420px] px-6 py-6 text-center">
          <h1 className="text-[17px] font-semibold">Экран уже подключён</h1>
          <p className="mt-2 text-[13px] text-text-muted">
            Эта сессия уже подтверждена. Вернитесь в панель и посмотрите список экранов.
          </p>
        </div>
      </main>
    )
  }

  const memberships = context.companies.filter((membership) =>
    accessFor(context, membership.companyId).can(PERMISSIONS.screensPair),
  )

  if (memberships.length === 0) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <div className="card max-w-[420px] px-6 py-6">
          <h1 className="text-[17px] font-semibold">Недостаточно прав</h1>
          <p className="mt-2 text-[13px] text-text-muted">
            Подтверждать привязку экранов могут только владелец компании и администратор.
          </p>
        </div>
      </main>
    )
  }

  const firstMembership = memberships[0]
  if (!firstMembership) return null

  const firstAccess = accessFor(context, firstMembership.companyId)

  // Филиалы вне области доступа не показываем: сотрудник не должен видеть
  // список филиалов, к которым у него нет доступа.
  const branches = getBranchOptions(firstMembership.companyId).filter((branch) =>
    hasScopeAccess(firstAccess.scopes, { branchId: branch.id }),
  )

  const groups = getGroupOptions(firstMembership.companyId)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <LinkToLogin href="/dashboard" />
        <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.02em]">Подключение экрана</h1>
        <p className="mt-1.5 text-[13px] text-text-muted">
          Вы вошли как {ROLE_LABELS[firstAccess.role]}. Выберите, куда привязать экран.
        </p>
      </div>

      <ConfirmForm
        sessionId={sessionId}
        codeFromQr={codeFromQr ?? null}
        codeRequired={!state.codeInQr}
        expiresAt={new Date(Date.now() + (state.state === 'pending' ? state.remainingMs : 0)).toISOString()}
        companies={memberships.map((membership) => ({
          id: membership.companyId,
          name: membership.companyName,
        }))}
        defaultCompanyId={firstMembership.companyId}
        branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
      />
    </main>
  )
}
