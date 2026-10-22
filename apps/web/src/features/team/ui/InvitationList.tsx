'use client'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/card'
import { Badge } from '@/components/ui/status-badge'
import { formatDate } from '../roles'
import type { InvitationView, RoleOption } from '../model'

/** Открытые приглашения и их отзыв. */
export function InvitationList(props: {
  invitations: InvitationView[]
  roles: RoleOption[]
  canWrite: boolean
  busy: boolean
  onRevoke: (invitationId: string) => void
}) {
  return (
    <Card>
      <CardHeader
        title="Приглашения"
        description="Ссылка живёт неделю. Принять приглашение может только тот, кому она отправлена."
      />
      <CardBody className="p-0">
        {props.invitations.length === 0 ? (
          <EmptyState
            title="Открытых приглашений нет"
            hint="Пригласите сотрудника, чтобы он получил доступ к контенту и экранам компании."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {props.invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{invitation.email}</div>
                  <div className="text-[12px] text-text-subtle">
                    {props.roles.find((role) => role.role === invitation.role)?.label ?? invitation.role} · до{' '}
                    {formatDate(invitation.expiresAt)}
                  </div>
                </div>

                {invitation.expired ? <Badge tone="neutral">истекло</Badge> : <Badge tone="info">ждёт</Badge>}

                {props.canWrite && !invitation.expired ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={props.busy}
                    onClick={() => props.onRevoke(invitation.id)}
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
  )
}
