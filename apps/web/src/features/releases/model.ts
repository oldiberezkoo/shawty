export type DeliverySummaryView = {
  sent: number
  applied: number
  downloading: number
  noContact: number
  total: number
  failed?: number
}

export type ReceiptView = {
  screenId: string
  screenName: string
  state: string
  ackedAt: string | null
  errorCode?: string | null
}

export type AssignmentView = {
  id: string
  scopeType: 'screen' | 'group' | 'branch' | 'company'
  scopeId: string
  playlistVersionId: string
}

export type PlaylistVersionView = {
  playlistId: string
  name: string
  version: number | null
  versions: { id: string; version: number }[]
}

export type ScopeOption = { id: string; name: string }

/** Живые числа доставки, которые доска получает опросом. */
export type DeliverySnapshot = {
  summary?: DeliverySummaryView
  receipts?: ReceiptView[]
}
