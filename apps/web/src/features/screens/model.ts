import type { ScreenState } from '@/components/ui/status-badge'

/** Строка парка экранов: всё, что нужно таблице и выбору плейлиста. */
export type ScreenRow = {
  id: string
  name: string
  onlineState: ScreenState
  branchId: string | null
  branchName: string | null
  groupId: string | null
  groupName: string | null
  deviceId: string | null
  lastSeenSecondsAgo: number | null
  playerVersion: string | null
  desiredVersion: number | null
  appliedVersion: number | null
}

/** Поля экрана, которые можно изменить в его карточке. */
export type ScreenEditValues = {
  id: string
  name: string
  branchId: string | null
  groupId: string | null
  offlineAfterSec: number
}

/** Последний замер связи, который пришёл с heartbeat. */
export type ScreenTelemetry = {
  pingMs: number | null
  downlinkKbps: number | null
  networkRttMs: number | null
  stateLatencyMs: number | null
  effectiveType: string | null
  at: string | null
}

export type ScreenIncident = {
  id: string
  type: string
  openedAt: string
  closedAt: string | null
  detail: string | null
}

export type ScreenError = {
  code: string
  message: string
  at: string
}

/** Материал программы, которую показывает экран. */
export type ScreenProgramItem = {
  id: string
  position: number
  kind: 'image' | 'video'
  assetId: string
  hasPoster: boolean
  fileName: string | null
  mime: string
  durationMs: number | null
}

/** Всё, что карточка экрана знает о телевизоре. */
export type ScreenDetailView = ScreenEditValues & {
  onlineState: ScreenState
  branchName: string | null
  groupName: string | null
  deviceId: string | null
  lastSeenSecondsAgo: number | null
  playerVersion: string | null
  desiredVersion: number | null
  appliedVersion: number | null
  /** Что выбрало расписание и кампании. */
  planned: { name: string } | null
  /** Что экран подтвердил. */
  published: { name: string } | null
  nextChangeAt: string | null
  playedLast24h: number
  telemetry: ScreenTelemetry | null
  telemetryHistory: { pingMs: number | null; downlinkKbps: number | null }[]
  capabilities: Record<string, unknown> | null
  incidents: ScreenIncident[]
  errors: ScreenError[]
}
