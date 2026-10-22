export type ScreenSchedule = {
  screenId: string
  screenName: string
  timezone: string
  timezoneSource: string
  nextChangeAt: string | null
  appliedVersion: number | null
  desiredVersion: number | null
  needsChange: boolean
  campaignId: string | null
  campaignName: string | null
  playlist: { name: string; version: number } | null
  fallbackPlaylist: { name: string; version: number } | null
  chain: { campaignId: string; campaignName: string }[]
}

export type Segment = {
  from: string
  to: string
  campaignId: string | null
  playlistVersionId: string | null
}

export type CampaignInterval = {
  campaignId: string
  name: string
  priority: number
  intervals: { start: string; end: string }[]
}

export type Preview = {
  screen: ScreenSchedule
  from: string
  to: string
  days: number
  segments: Segment[]
  campaigns: CampaignInterval[]
  nextChangeAt: string | null
}
