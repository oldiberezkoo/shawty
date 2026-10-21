import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { apiGet } from '@/server/api'
import { TeamBoard } from './TeamBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Команда' }

export default async function TeamPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const companyId = membership.companyId

  const [team, structure, screensData] = await Promise.all([
    apiGet<{ members: any[]; invitations: any[]; roles: any[] }>('/api/dashboard/team', companyId),
    apiGet<{ branches: any[]; groups: any[] }>('/api/dashboard/structure', companyId),
    apiGet<{ screens: any[] }>('/api/dashboard/screens', companyId),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Команда</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-text-muted">
          Кто работает с контентом и экранами. Роль отвечает за действия, доступ — за то, какие филиалы и экраны
          человек видит. И то, и другое действует только в этой компании.
        </p>
      </div>

      <TeamBoard
        companyId={companyId}
        currentUserId={session.userId}
        canWrite={access.can(PERMISSIONS.teamWrite)}
        members={team.members.map((member) => ({
          membershipId: member.membershipId,
          userId: member.userId,
          name: member.name,
          email: member.email,
          role: member.role,
          roleLabel: member.roleLabel,
          status: member.status,
          scopes: member.scopes.map((scope: any) => ({ scopeType: scope.scopeType, scopeId: scope.scopeId })),
        }))}
        invitations={team.invitations.map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: new Date(invitation.expiresAt).toISOString(),
          invitedBy: invitation.invitedBy,
          expired: invitation.expired,
        }))}
        roles={team.roles}
        branches={structure.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        groups={structure.groups.map((group) => ({ id: group.id, name: group.name }))}
        screens={screensData.screens.map((screen) => ({
          id: screen.id,
          name: screen.name,
          branchId: screen.branchId,
          branchName: screen.branchName,
        }))}
      />
    </div>
  )
}