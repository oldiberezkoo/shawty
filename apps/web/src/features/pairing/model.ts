/** Этапы экрана привязки. */
export type PairingPhase = 'starting' | 'waiting' | 'exchanging' | 'paired' | 'expired' | 'error'

/** Сессия привязки, которую выдал сервер. */
export type PairingSession = {
  sessionId: string
  code: string
  expiresAt: string
  confirmUrl: string
  pollAfterMs: number
  codeInQr: boolean
}

export type PairingWatchState = 'pending' | 'confirmed' | 'expired' | 'rejected'

/** Состояние сессии, которое отдаёт резервный опрос. */
export type PairingStatus = {
  sessionId: string
  state: PairingWatchState
  remainingMs?: number
  codeInQr?: boolean
}
