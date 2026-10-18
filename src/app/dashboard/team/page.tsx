import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from '@/domain/authz/permissions'
import { listInvitations, listMembers } from '@/server/services/team-service'
import { TeamBoard } from './TeamBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Команда' }

export default async function TeamPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const companyId = membership.companyId

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Команда</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-text-muted">
          Кто работает с контентом и экранами и за что отвечает. Роль действует только в этой компании: один человек
          может вести две компании и нигде не иметь доступа к оплате.
        </p>
      </div>

      <TeamBoard
        companyId={companyId}
        currentUserId={session.userId}
        canWrite={access.can(PERMISSIONS.teamWrite)}
        members={listMembers(companyId).map((member) => ({
          membershipId: member.membershipId,
          userId: member.userId,
          name: member.name,
          email: member.email,
          role: member.role,
          roleLabel: ROLE_LABELS[member.role],
          status: member.status,
          scopes: member.scopes.map((scope) => ({ scopeType: scope.scopeType, scopeId: scope.scopeId })),
        }))}
        invitations={listInvitations(companyId).map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt.toISOString(),
          invitedBy: invitation.invitedBy,
          expired: invitation.expired,
        }))}
        roles={Object.entries(ROLE_LABELS).map(([role, label]) => ({
          role,
          label,
          permissions: ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? [],
        }))}
      />
    </div>
  )
}