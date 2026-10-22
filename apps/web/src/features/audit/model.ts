/** Запись журнала действий в том виде, в каком её отдаёт API. */
export type AuditRow = {
  id: string
  action: string
  actionLabel: string
  targetType: string | null
  targetId: string | null
  meta: Record<string, unknown> | null
  ip: string | null
  at: string
  actorName: string | null
}

export type AuditActorCount = {
  actorUserId: string | null
  actorName: string | null
  actions: number
  lastActionAt: string
}

export type AuditGroup = { label: string; prefix: string }

export type AuditActorOption = { actorUserId: string | null; actorName: string | null }

export type AuditResponse = {
  rows: AuditRow[]
  total: number
  actors: AuditActorOption[]
  byActor: AuditActorCount[]
  groups: AuditGroup[]
}

/** Данные выгрузки: CSV и признак того, что он обрезан по лимиту. */
export type AuditExport = {
  csv: string
  rows: number
  truncated: boolean
}
