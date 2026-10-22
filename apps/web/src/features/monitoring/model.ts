export type SilentScreen = {
  screenId: string
  screenName: string
  branchName: string | null
  silentSeconds: number
}

export type OpenDowntime = {
  screenId: string
  screenName: string
  branchName: string | null
  openedAt: string
  silentSeconds: number | null
}

export type FeedItem = {
  id: string
  screenId: string
  screenName: string
  type: string
  openedAt: string
  closedAt: string | null
  detail: string | null
  durationMs: number | null
}

export type PlayerError = {
  screenId: string
  code: string
  message: string
  at: string
}

export type TelemetrySample = {
  pingMs: number | null
  downlinkKbps: number | null
  networkRttMs: number | null
  stateLatencyMs: number | null
  effectiveType: string | null
  at: string
}

export type TelemetryPoint = {
  at: string
  pingMs: number | null
  downlinkKbps: number | null
  networkRttMs: number | null
  stateLatencyMs: number | null
}

export type DeviceRow = {
  id: string
  name: string
  branchName: string | null
  onlineState: 'online' | 'syncing' | 'offline' | 'error' | 'unpaired' | 'disabled' | 'revoked'
  lastSeenSecondsAgo: number | null
  playerVersion: string | null
  pendingRelease: boolean
  platform: string | null
  screenWidth: number | null
  screenHeight: number | null
  deviceMemoryGb: number | null
  hardwareConcurrency: number | null
  telemetry: TelemetrySample | null
  history: TelemetryPoint[]
}

export type Totals = { screens: number; online: number; offline: number; inactive: number }

/** Ответ мониторинга целиком. */
export type MonitoringSnapshot = {
  totals: Totals
  devices: DeviceRow[]
  silent: SilentScreen[]
  openDowntimes: OpenDowntime[]
  feed: FeedItem[]
  errors: PlayerError[]
}
