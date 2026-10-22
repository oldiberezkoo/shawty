export type PlaylistSummaryItem = {
  id: string
  name: string
  state: 'draft' | 'published'
  version: number | null
  items: number
  cycleDurationMs: number
  assigned: boolean
}

export type AssetOption = {
  id: string
  kind: 'image' | 'video' | 'template'
  fileName: string | null
  mime: string
  width: number | null
  height: number | null
  durationMs: number | null
  hasPoster: boolean
  posterSha256: string | null
  state: string
}

export type PlaylistItem = {
  id: string
  position: number
  kind: 'image' | 'video'
  assetId: string
  fileName: string | null
  mime: string
  bytes: number
  durationMs: number | null
  assetDurationMs: number | null
  state: string
  hasPoster: boolean
  posterSha256: string | null
}

export type PlaylistDetail = {
  id: string
  name: string
  state: 'draft' | 'published'
  version: number | null
  cycleDurationMs: number
  assigned: boolean
  items: PlaylistItem[]
}
