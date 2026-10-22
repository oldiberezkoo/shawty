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

export type ScopeOption = {
  id: string
  name: string
  branchId?: string | null
  branchName?: string | null
}

export type ScopeDraft = { scopeType: 'branch' | 'group' | 'screen'; scopeId: string }
