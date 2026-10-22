import { readCsrfToken } from '@/shared/lib/csrf'
import type { AssetOption, PlaylistDetail, PlaylistSummaryItem } from './model'

/** Список плейлистов компании. */
export async function fetchPlaylists(companyId: string): Promise<PlaylistSummaryItem[] | null> {
  const response = await fetch('/api/dashboard/playlists', {
    headers: { 'x-company-id': companyId },
  })
  if (!response.ok) return null

  const data = (await response.json()) as { playlists: PlaylistSummaryItem[] }
  return data.playlists
}

/** Медиатека в том виде, в котором её показывает выбор файлов. */
export async function fetchPlayableAssets(companyId: string): Promise<AssetOption[] | null> {
  const response = await fetch('/api/dashboard/media', {
    headers: { 'x-company-id': companyId },
  })
  if (!response.ok) return null

  const data = (await response.json()) as { assets: AssetOption[] }

  return data.assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    fileName: asset.fileName,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    hasPoster: asset.hasPoster,
    posterSha256: asset.posterSha256 ?? null,
    state: asset.state,
  }))
}

export async function fetchPlaylistDetail(
  companyId: string,
  playlistId: string,
): Promise<PlaylistDetail | null> {
  const response = await fetch(`/api/dashboard/playlists/${playlistId}`, {
    headers: { 'x-company-id': companyId },
  })
  if (!response.ok) return null

  const data = (await response.json()) as { playlist: PlaylistDetail }
  return data.playlist
}

export type UploadedFile =
  | { kind: 'ok'; assetId: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'network'; message: string }

/** Загрузка файла в медиатеку; вызывающий сам добавляет его в плейлист. */
export async function uploadPlaylistFile(companyId: string, file: File): Promise<UploadedFile> {
  const body = new FormData()
  body.set('file', file)

  try {
    const response = await fetch('/api/dashboard/media', {
      method: 'POST',
      headers: { 'x-company-id': companyId, 'x-csrf-token': readCsrfToken() },
      body,
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      return {
        kind: 'error',
        message: data?.error?.message ?? `Не удалось загрузить ${file.name}`,
      }
    }

    const data = (await response.json().catch(() => null)) as { assetId?: string } | null

    return { kind: 'ok', assetId: data?.assetId ?? null }
  } catch {
    return { kind: 'network', message: `Сервер недоступен при загрузке ${file.name}` }
  }
}

/**
 * Ожидание готовности загруженных файлов.
 *
 * Обработка идёт на сервере и занимает секунды. Добавить файл, пока он ещё
 * обрабатывается, нельзя — он был бы молча пропущен, поэтому ждём готовности
 * здесь, а не показываем «файл не добавлен» без объяснения.
 */
export async function waitForReadyAssets(
  companyId: string,
  assetIds: string[],
): Promise<string[]> {
  const deadline = Date.now() + 120_000
  let ready: string[] = []

  while (Date.now() < deadline) {
    const response = await fetch('/api/dashboard/media', { headers: { 'x-company-id': companyId } })
    if (!response.ok) break

    const data = (await response.json()) as { assets: { id: string; state: string }[] }
    const byId = new Map(data.assets.map((asset) => [asset.id, asset.state]))

    ready = assetIds.filter((id) => byId.get(id) === 'ready')
    const failed = assetIds.filter((id) => byId.get(id) === 'failed')

    if (ready.length + failed.length === assetIds.length) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  return ready
}
