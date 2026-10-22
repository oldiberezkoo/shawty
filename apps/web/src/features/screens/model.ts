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
