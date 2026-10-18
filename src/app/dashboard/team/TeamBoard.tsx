'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { SelectField, FormField, FormError } from '@/components/ui/form'
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

/** Право переводится в понятное действие: список прав бесполезен невооружённому. */
const PERMISSION_HINTS: Record<string, string> = {
  'screens:pair': 'привязывать телевизоры',
  'screens:unpair': 'отвязывать экраны',
  'screens:rotate': 'менять секрет экрана',
  'screens:disable': 'отключать экраны',
  'media:write': 'загружать файлы',
  'media:delete': 'удалять файлы',
  'playlists:write': 'собирать плейлисты',
  'playlists:publish': 'фиксировать версии плейлистов',
  'campaigns:write': 'создавать кампании',
  'campaigns:approve': 'согласовывать кампании',
  'releases:publish': 'публиковать на сеть',
  'analytics:read': 'видеть аналитику',
  'monitoring:read': 'видеть мониторинг',
  'audit:read': 'видеть журнал действий',
  'team:write': 'управлять командой',
  'billing:write': 'менять тариф',
  'companyTransfer': 'передавать компанию',
  'settings:write': 'менять настройки компании',
}

function describePermissions(permissions: readonly string[]): string {
  const hints = permissions.map((permission) => PERMISSION_HINTS[permission]).filter(Boolean)

  // Права, не переведённые в подсказку, игнорируются намеренно: перечислить
  // «screens:read» и «groups:read» бесполезно, это очевидные чтения.
  if (hints.length === 0) return 'Только просмотр'

  const shown = hints.slice(0, 4).join(', ')
  const rest = hints.length - 4

  return rest > 0 ? `${shown} и ещё ${rest}` : shown
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
  canWrite,
  currentUserId,
}: {
  companyId: string
  members: MemberView[]
  invitations: InvitationView[]
  roles: RoleOption[]
  canWrite: boolean
  currentUserId: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

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
                </div>

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
          title="Роли и права"
          description="Что именно получит человек. Роль выбирается один раз, при приглашении, и меняется здесь же."
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {roles.map((role) => (
              <li key={role.role} className="px-5 py-3">
                <div className="text-[13px] font-medium">{role.label}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-text-muted">
                  {describePermissions(role.permissions)}
                </div>
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