'use client'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/status-badge'
import { describeScope } from '@/shared/lib/scope-label'
import type { MemberView, RoleOption, ScopeOption } from '../model'

/** Список сотрудников: роль меняется на месте, доступ ограничивается диалогом. */
export function MemberList(props: {
  members: MemberView[]
  roles: RoleOption[]
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
  currentUserId: string
  canWrite: boolean
  busy: boolean
  onInvite: () => void
  onChangeRole: (membershipId: string, role: string) => void
  onSuspend: (member: MemberView) => void
  onEditScopes: (member: MemberView) => void
}) {
  const scopes = { branches: props.branches, groups: props.groups, screens: props.screens }
  const owners = props.members.filter((member) => member.role === 'owner').length

  return (
    <Card>
      <CardHeader
        title="Сотрудники"
        description="Роль задаётся в контексте компании. Человек может вести контент в одной компании и не иметь доступа к оплате в ней же."
        action={
          props.canWrite ? (
            <Button size="sm" variant="primary" onClick={() => props.onInvite()}>
              Пригласить
            </Button>
          ) : null
        }
      />
      <CardBody className="p-0">
        <ul className="divide-y divide-[var(--border)]">
          {props.members.map((member) => (
            <li key={member.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{member.name}</span>
                  {member.userId === props.currentUserId ? <Badge tone="info">вы</Badge> : null}
                  {member.status === 'suspended' ? <Badge tone="warn">приостановлен</Badge> : null}
                </div>
                <div className="truncate text-[12px] text-text-subtle">{member.email}</div>
                <div
                  className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-text-subtle"
                  title={
                    member.scopes.length === 0
                      ? 'Доступ ко всем текущим и будущим филиалам и экранам'
                      : member.scopes.map((scope) => describeScope(scope, scopes)).join(', ')
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
                          className=" bg-surface-3 px-1.5 py-0.5 text-text-muted"
                        >
                          {describeScope(scope, scopes)}
                        </span>
                      ))}
                      {member.scopes.length > 2 ? <span>+{member.scopes.length - 2}</span> : null}
                    </>
                  )}
                </div>
              </div>

              {props.canWrite && member.role !== 'owner' && member.userId !== props.currentUserId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={props.busy}
                  onClick={() => props.onEditScopes(member)}
                  title="Ограничить доступ филиалами, группами или экранами"
                >
                  Доступ
                </Button>
              ) : null}

              {props.canWrite && member.role !== 'owner' && member.userId !== props.currentUserId ? (
                <select
                  value={member.role}
                  disabled={props.busy}
                  onChange={(event) => props.onChangeRole(member.membershipId, event.target.value)}
                  aria-label={`Роль: ${member.name}`}
                  className="h-8 shrink-0 border border-border bg-surface px-2 text-[13px] text-text disabled:opacity-50"
                >
                  {props.roles
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

              {props.canWrite && member.role !== 'owner' && member.userId !== props.currentUserId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={props.busy}
                  onClick={() => props.onSuspend(member)}
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
  )
}
