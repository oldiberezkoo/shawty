'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormError, FormSuccess } from '@/components/ui/form'
import { teamRequest } from '../api'
import type { InvitationView, MemberView, RoleOption, ScopeOption } from '../model'
import { InvitationList } from './InvitationList'
import { InviteDialog } from './InviteDialog'
import { MemberList } from './MemberList'
import { RoleGuide } from './RoleGuide'
import { ScopeDialog } from './ScopeDialog'

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
        const result = await teamRequest(companyId, method, body, invitationId)

        if (!result.ok) {
          setError(result.message)
          return null
        }

        return result.data
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

  return (
    <div className="flex flex-col gap-6">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      {inviteLink ? (
        <FormError onDismiss={() => setInviteLink(null)}>
          <span className="block">Ссылка-приглашение (показывается один раз):</span>
          <code className="mt-1 block overflow-x-auto  bg-surface px-2 py-1 text-[12px] select-all">
            {inviteLink}
          </code>
        </FormError>
      ) : null}

      <MemberList
        members={members}
        roles={roles}
        branches={branches}
        groups={groups}
        screens={screens}
        currentUserId={currentUserId}
        canWrite={canWrite}
        busy={busy}
        onInvite={() => setInviteOpen(true)}
        onChangeRole={(membershipId, role) => void changeRole(membershipId, role)}
        onSuspend={(member) =>
          void call('PATCH', {
            membershipId: member.membershipId,
            action: member.status === 'suspended' ? 'restore' : 'suspend',
          })
        }
        onEditScopes={setScopeMember}
      />

      <RoleGuide roles={roles} />

      <InvitationList
        invitations={invitations}
        roles={roles}
        canWrite={canWrite}
        busy={busy}
        onRevoke={(invitationId) => void call('DELETE', {}, invitationId)}
      />

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

      {scopeMember ? (
        <ScopeDialog
          companyId={companyId}
          member={scopeMember}
          branches={branches}
          groups={groups}
          screens={screens}
          onClose={() => setScopeMember(null)}
          onDone={() => {
            setScopeMember(null)
            setNotice(`Доступ для ${scopeMember.name} сохранён.`)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
