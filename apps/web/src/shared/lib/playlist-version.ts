import { formatDuration } from '@/domain/playlist/rules'

/**
 * Версия плейлиста в селекте «что показывать».
 *
 * Выбор идёт версией, а не плейлистом: назначить можно только неизменяемый
 * снимок. Форма одна на три раздела — экраны, расписание и публикации, —
 * поэтому она живёт в общем слое, а не переобъявляется в каждом.
 */
export type PlaylistVersionChoice = {
  id: string
  playlistName: string
  version: number
  itemCount: number
  totalDurationMs: number
  isCurrent: boolean
}

/** Подпись варианта: «Утро · 12 мат. · 3 мин 20 сек». */
export function describePlaylistVersion(choice: PlaylistVersionChoice): string {
  return `${choice.playlistName} · ${choice.itemCount} мат. · ${formatDuration(choice.totalDurationMs)}`
}
