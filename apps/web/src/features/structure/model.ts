export type BranchView = {
  id: string
  name: string
  code: string | null
  timezone: string | null
  screens: number
}

export type GroupView = {
  id: string
  name: string
  branchId: string | null
  branchName: string | null
  screens: number
}

export type ScreenRef = {
  id: string
  name: string
  branchId: string | null
  groupId: string | null
}

export type DeleteTarget = { kind: 'branch' | 'group'; id: string; name: string }
