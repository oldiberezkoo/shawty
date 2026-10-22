export type MediaItem = {
  id: string
  /** Имя файла, как его прислал оператор. */
  fileName: string | null
  kind: 'image' | 'video'
  state: 'processing' | 'ready' | 'failed'
  mime: string
  bytes: number
  width: number | null
  height: number | null
  durationMs: number | null
  transcoded: boolean
  error: string | null
  hasPoster: boolean
  /** Хеш постера: меняется вместе с файлом и служит ключом кеша браузера. */
  posterSha256: string | null
  createdAt: string
}
