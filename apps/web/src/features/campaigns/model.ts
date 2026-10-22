export type CampaignTargetView = {
  scopeType: 'screen' | 'group' | 'branch' | 'company'
  scopeId: string
}

export type CampaignWindowView = {
  daysOfWeek: number
  startMinute: number
  endMinute: number
  timezoneSource: 'branch' | 'company' | 'campaign'
}

export type CampaignView = {
  id: string
  name: string
  kind: 'internal' | 'commercial'
  priority: number
  status: string
  startsOn: string
  endsOn: string | null
  /** Точное начало/окончание в ISO, если задано время. */
  startsAt: string | null
  endsAt: string | null
  approvalRequired: boolean
  playlistVersionId: string | null
  playlistName: string | null
  playlistVersion: number | null
  fallbackPlaylistVersionId: string | null
  timezoneOverride: string | null
  targets: CampaignTargetView[]
  windows: CampaignWindowView[]
  withinDates: boolean
}

export type ScopeOption = { id: string; name: string }
export type PlaylistVersionOption = { id: string; label: string }

/** Площадка, которую можно выбрать в форме: «вся компания» задаётся отдельным флагом. */
export type TargetDraft = { scopeType: 'branch' | 'group' | 'screen'; scopeId: string }

/** Тело запроса создания или правки кампании. */
export type CampaignDraft = {
  name: string
  kind: CampaignView['kind']
  priority: number
  startsOn: string
  endsOn: string | null
  startsAt: string | null
  endsAt: string | null
  approvalRequired: boolean
  playlistVersionId: string
  fallbackPlaylistVersionId: string | null
  timezoneOverride: string | null
  targets: CampaignTargetView[]
  windows: CampaignWindowView[]
}
