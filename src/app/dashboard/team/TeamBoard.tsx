'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { SelectField, FormField, FormError, FormSuccess } from '@/components/ui/form'
import { Badge } from '@/components/ui/status-badge'
import { CSRF_COOKIE } from '@/lib/cookie-names'

export type MemberView = {
  membershipId: string
  userId: string
  name: string
  email: string
  role: string
  roleLabel: string
  status: 'active' | 'invited' | 'suspended'
  scopes: { scopeType: string; scopeId: string }[]
}

export type InvitationView = {
  id: string
  email: string
  role: string
  expiresAt: string
  invitedBy: string
  expired: boolean
}

export type RoleOption = { role: string; label: string; permissions: readonly string[] }
export type ScopeOption = { id: string; name: string; branchId?: string | null }

function scopeLabel(
  scope: { scopeType: string; scopeId: string },
  options: { branches: ScopeOption[]; groups: ScopeOption[]; screens: ScopeOption[] },
): string {
  switch (scope.scopeType) {
    case 'branch':
      return `филиал «${options.branches.find((item) => item.id === scope.scopeId)?.name ?? 'удалён'}»`
    case 'group':
      return `группа «${options.groups.find((item) => item.id === scope.scopeId)?.name ?? 'удалена'}»`
    case 'screen':
      return `экран «${options.screens.find((item) => item.id === scope.scopeId)?.name ?? 'удалён'}»`
    default:
      return 'вся компания'
  }
}

/**
 * Области работы, а не список прав.
 *
 * «И ещё 12» ничего не объясняет: администратору нужно понять, что человек
 * меняет в компании, а не выучить двадцать строк `screens:*`. Области
 * показывают ровно это, а полный набор прав при необходимости виден в подсказке.
 */
const ROLE_AREAS: { label: string; hint: string; permissions: readonly string[] }[] = [
  {
    label: 'Экраны',
    hint: 'привязка телевизоров, филиалы и группы',
    permissions: ['screens:pair', 'screens:unpair', 'screens:rotate', 'screens:disable', 'branches:write', 'groups:write'],
  },
  {
    label: 'Контент',
    hint: 'загрузка файлов, плейлисты и версии',
    permissions: ['media:write', 'media:delete', 'playlists:write', 'playlists:publish'],
  },
  {
    label: 'Показ',
    hint: 'кампании и публикация на экраны',
    permissions: ['campaigns:write', 'campaigns:approve', 'releases:publish'],
  },
  {
    label: 'Команда',
    hint: 'сотрудники, настройки компании и оплата',
    permissions: ['team:write', 'settings:write', 'billing:write', 'companyTransfer'],
  },
]

function roleAreas(permissions: readonly string[]): string[] {
  const areas = ROLE_AREAS.filter((area) => area.permissions.some((permission) => permissions.includes(permission)))

  if (areas.length > 0) return areas.map((area) => area.label)

  return permissions.includes('audit:read') || permissions.includes('analytics:read')
    ? ['Просмотр и отчёты']
    : ['Только просмотр']
}

function areaHint(label: string): string | undefined {
  return ROLE_AREAS.find((area) => area.label === label)?.hint
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

/**
 * Команда компании.
 *
 * Список людей, их роли и приглашения. Роль меняется на месте — иначе
 * «изменить права сотрудника» требует трёх шагов и страницы настроек.
 */
export function TeamBoard({
  companyId,
  members,
  invitations,
  roles,
  branches,
  groups,
  screens,
  canWrite,
  currentUserId,
}: {
  companyId: string
  members: MemberView[]
  invitations: InvitationView[]
  roles: RoleOption[]
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
  canWrite: boolean
  currentUserId: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [scopeMember, setScopeMember] = useState<MemberView | null>(null)

  const call = useCallback(
    async (method: 'POST' | 'PATCH' | 'DELETE', body: unknown, invitationId?: string) => {
      setError(null)
      setBusy(true)

      try {
        const url = invitationId
          ? `/api/dashboard/team?invitationId=${encodeURIComponent(invitationId)}`
          : '/api/dashboard/team'

        const response = await fetch(url, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-company-id': companyId,
            'x-csrf-token': readCsrf(),
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Не удалось выполнить действие')
          return null
        }

        return (await response.json().catch(() => null)) as Record<string, unknown> | null
      } finally {
        setBusy(false)
        router.refresh()
      }
    },
    [companyId, router],
  )

  const changeRole = useCallback(
    async (membershipId: string, role: string) => {
      await call('PATCH', { membershipId, action: 'role', role })
    },
    [call],
  )

  const owners = members.filter((member) => member.role === 'owner').length

  return (
    <div className="flex flex-col gap-6">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      {inviteLink ? (
        <FormError onDismiss={() => setInviteLink(null)}>
          <span className="block">Ссылка-приглашение (показывается один раз):</span>
          <code className="mt-1 block overflow-x-auto rounded bg-surface px-2 py-1 text-[12px] select-all">
            {inviteLink}
          </code>
        </FormError>
      ) : null}

      <Card>
        <CardHeader
          title="Сотрудники"
          description="Роль задаётся в контексте компании. Человек может вести контент в одной компании и не иметь доступа к оплате в ней же."
          action={
            canWrite ? (
              <Button size="sm" variant="primary" onClick={() => setInviteOpen(true)}>
                Пригласить
              </Button>
            ) : null
          }
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {members.map((member) => (
              <li key={member.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{member.name}</span>
                    {member.userId === currentUserId ? <Badge tone="info">вы</Badge> : null}
                    {member.status === 'suspended' ? <Badge tone="warn">приостановлен</Badge> : null}
                  </div>
                  <div className="truncate text-[12px] text-text-subtle">{member.email}</div>
                  <div
                    className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-text-subtle"
                    title={
                      member.scopes.length === 0
                        ? 'Доступ ко всем текущим и будущим филиалам и экранам'
                        : member.scopes
                            .map((scope) => scopeLabel(scope, { branches, groups, screens }))
                            .join(', ')
                    }
                  >
                    <span>Доступ:</span>
                    {member.scopes.length === 0 ? (
                      <span>вся компания</span>
                    ) : (
                      <>
                        {member.scopes.slice(0, 2).map((scope) => (
                          <span
                            key={`${scope.scopeType}:${scope.scopeId}`}
                            className="rounded bg-surface-3 px-1.5 py-0.5 text-text-muted"
                          >
                            {scopeLabel(scope, { branches, groups, screens })}
                          </span>
                        ))}
                        {member.scopes.length > 2 ? <span>+{member.scopes.length - 2}</span> : null}
                      </>
                    )}
                  </div>
                </div>

                {canWrite && member.role !== 'owner' && member.userId !== currentUserId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setScopeMember(member)}
                    title="Ограничить доступ филиалами, группами или экранами"
                  >
                    Доступ
                  </Button>
                ) : null}

                {canWrite && member.role !== 'owner' && member.userId !== currentUserId ? (
                  <select
                    value={member.role}
                    disabled={busy}
                    onChange={(event) => void changeRole(member.membershipId, event.target.value)}
                    aria-label={`Роль: ${member.name}`}
                    className="h-8 shrink-0 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[13px] text-text disabled:opacity-50"
                  >
                    {roles
                      .filter((role) => role.role !== 'owner')
                      .map((role) => (
                        <option key={role.role} value={role.role}>
                          {role.label}
                        </option>
                      ))}
                  </select>
                ) : (
                  <Badge tone={member.role === 'owner' ? 'info' : 'neutral'}>{member.roleLabel}</Badge>
                )}

                {canWrite && member.role !== 'owner' && member.userId !== currentUserId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void call('PATCH', {
                        membershipId: member.membershipId,
                        action: member.status === 'suspended' ? 'restore' : 'suspend',
                      })
                    }
                  >
                    {member.status === 'suspended' ? 'Вернуть' : 'Приостановить'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>

          {/* Предупреждение о единственном владельце: если он уйдёт, компанию
              уже нельзя будет продать или передать без ручного вмешательства. */}
          {owners === 1 ? (
            <p className="border-t border-border px-5 py-3 text-[12px] text-text-subtle">
              В компании один владелец. Перед его уходом передайте права другому сотруднику — иначе управлять
              тарифом и составом команды будет некому.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Что может каждая роль"
          description="Области показывают, что роль меняет. Читать экраны, плейлисты и отчёты может любая роль; доступ к части филиалов ограничивается кнопкой «Доступ» у сотрудника."
        />
        <CardBody>
          <ul className="flex flex-col gap-3">
            {roles.map((role) => (
              <li key={role.role} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="w-32 shrink-0 text-[13px] font-medium">{role.label}</span>
                <span className="flex flex-wrap gap-1.5">
                  {roleAreas(role.permissions).map((area) => (
                    <span
                      key={area}
                      title={areaHint(area)}
                      className="rounded-full border border-border px-2 py-0.5 text-[12px] text-text-muted"
                    >
                      {area}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Приглашения"
          description="Ссылка живёт неделю. Принять приглашение может только тот, кому она отправлена."
        />
        <CardBody className="p-0">
          {invitations.length === 0 ? (
            <EmptyState
              title="Открытых приглашений нет"
              hint="Пригласите сотрудника, чтобы он получил доступ к контенту и экранам компании."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{invitation.email}</div>
                    <div className="text-[12px] text-text-subtle">
                      {roles.find((role) => role.role === invitation.role)?.label ?? invitation.role} · до{' '}
                      {formatDate(invitation.expiresAt)}
                    </div>
                  </div>

                  {invitation.expired ? <Badge tone="neutral">истекло</Badge> : <Badge tone="info">ждёт</Badge>}

                  {canWrite && !invitation.expired ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void call('DELETE', {}, invitation.id)}
                    >
                      Отозвать
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {inviteOpen ? (
        <InviteDialog
          companyId={companyId}
          roles={roles}
          onClose={() => setInviteOpen(false)}
          onDone={async (email, role) => {
            setInviteOpen(false)
            const result = await call('POST', { email, role })
            if (result?.token) {
              setInviteLink(`${window.location.origin}/join?token=${result.token}`)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function InviteDialog({
  companyId,
  roles,
  onClose,
  onDone,
}: {
  companyId: string
  roles: RoleOption[]
  onClose: () => void
  onDone: (email: string, role: string) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/dashboard/team', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-company-id': companyId,
          'x-csrf-token': readCsrf(),
        },
        body: JSON.stringify({ email, role }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(payload?.error?.message ?? 'Не удалось пригласить')
        return
      }

      onDone(email, role)
    } finally {
      setBusy(false)
    }
  }, [companyId, email, onDone, role])

  return (
    <Modal
      open
      onClose={onClose}
      title="Пригласить сотрудника"
      description="Письмо не отправляется автоматически: ссылка появится здесь и её нужно передать сотруднику. Показывается один раз."
      size="sm"
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" variant="primary" disabled={busy || !email} onClick={() => void submit()}>
            Создать приглашение
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

        <FormField
          label="Адрес почты"
          name="email"
          type="email"
          value={email}
          onValueChange={setEmail}
          placeholder="anna@example.uz"
          description="Приглашение придёт на этот адрес. Если человек уже зарегистрирован в системе, он станет сотрудником сразу."
        />

        <SelectField
          label="Роль"
          name="role"
          value={role}
          onValueChange={(value) => setRole(value ?? 'editor')}
          options={roles
            .filter((entry) => entry.role !== 'owner')
            .map((entry) => ({ value: entry.role, label: entry.label }))}
        />
      </div>
    </Modal>
  )
}