import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Clock, MonitorCheck, ShieldAlert } from 'lucide-react'
import { accessFor, hasScopeAccess, ROLE_LABELS, PERMISSIONS } from '@/domain/authz/permissions'
import { apiGet, ApiError } from '@/server/api'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmForm } from './ConfirmForm'
import { LinkToLogin } from './LinkToLogin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Подтверждение подключения экрана',
  robots: { index: false, follow: false },
}

/**
 * Завершающее состояние вместо тупика.
 *
 * Экран подтверждения открывают один раз и в спешке. Любое сообщение здесь —
 * «истекло», «уже подключено», «нет прав» — человек читает, уже стоя у
 * телевизора. Поэтому у каждого исхода есть кнопка, а не только объяснение:
 * иначе возвращаться в панель приходится через адресную строку.
 */
function TerminalState({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <Card className="w-full max-w-[420px]">
        <CardBody className="flex flex-col items-center px-6 py-8 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface-2 text-text-subtle">
            {icon}
          </div>

          <h1 className="text-[15px] font-semibold tracking-[-0.015em]">{title}</h1>
          <p className="mt-1.5 max-w-[36ch] text-[13px] leading-relaxed text-text-muted">{hint}</p>

          <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>
        </CardBody>
      </Card>
    </main>
  )
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

  const returnTo = `/pair/${sessionId}${codeFromQr ? `?c=${codeFromQr}` : ''}`

  // Человек пришёл по QR без входа: отправляем на форму входа и возвращаем
  // обратно ровно на эту страницу, чтобы код не пришлось запоминать.
  let data: any

  try {
    data = await apiGet<any>(`/api/pairing/sessions/${sessionId}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    }
    throw error
  }

  const state = data

  if (state.state === 'expired') {
    return (
      <TerminalState
        icon={<Clock className="size-4" strokeWidth={1.8} />}
        title="Срок кода истёк"
        hint="Экран показывает, что время подтверждения вышло. Включите на нём получение нового кода — и введите его здесь."
      >
        <Link href="/pair">
          <Button size="sm" variant="primary">
            Ввести новый код
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button size="sm">В панель</Button>
        </Link>
      </TerminalState>
    )
  }

  if (state.state === 'confirmed') {
    return (
      <TerminalState
        icon={<MonitorCheck className="size-4" strokeWidth={1.8} />}
        title="Экран уже подключён"
        hint="Эта сессия уже подтверждена. Экран появился в списке и получает публикации."
      >
        <Link href="/dashboard/screens">
          <Button size="sm" variant="primary">
            Посмотреть экраны
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button size="sm">В панель</Button>
        </Link>
      </TerminalState>
    )
  }

  const memberships = data.companies.filter((membership: any) =>
    accessFor({ companies: data.companies }, membership.companyId).can(PERMISSIONS.screensPair),
  )

  if (memberships.length === 0) {
    return (
      <TerminalState
        icon={<ShieldAlert className="size-4" strokeWidth={1.8} />}
        title="Недостаточно прав"
        hint="Подтверждать привязку экранов могут только владелец компании и администратор. Попросите их подтвердить подключение."
      >
        <Link href="/dashboard">
          <Button size="sm">В панель</Button>
        </Link>
      </TerminalState>
    )
  }

  const firstMembership = memberships[0]
  if (!firstMembership) return null

  const firstAccess = accessFor({ companies: data.companies }, firstMembership.companyId)

  // Филиалы вне области доступа не показываем: сотрудник не должен видеть
  // список филиалов, к которым у него нет доступа.
  const branches = data.branches.filter((branch: any) =>
    hasScopeAccess(firstAccess.scopes, { branchId: branch.id }),
  )

  const groups = data.groups

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[540px] flex-col justify-center px-5 py-12">
      <div className="mb-7">
        <LinkToLogin href="/dashboard" />
        <h1 className="mt-6 page-title">Подключение экрана</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
          Вы вошли как {ROLE_LABELS[firstAccess.role]}. Выберите, куда привязать экран.
        </p>
      </div>

      <ConfirmForm
        sessionId={sessionId}
        codeFromQr={codeFromQr ?? null}
        codeRequired={!state.codeInQr}
        expiresAt={new Date(Date.now() + (state.state === 'pending' ? state.remainingMs : 0)).toISOString()}
        companies={memberships.map((membership: any) => ({
          id: membership.companyId,
          name: membership.companyName,
        }))}
        defaultCompanyId={firstMembership.companyId}
        branches={branches.map((branch: any) => ({ id: branch.id, name: branch.name }))}
        groups={groups.map((group: any) => ({ id: group.id, name: group.name }))}
      />
    </main>
  )
}
