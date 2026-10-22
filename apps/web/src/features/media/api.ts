import { readCsrfToken } from '@/shared/lib/csrf'
import type { MediaItem } from './model'

/** Список файлов медиатеки. Сетевой сбой не ошибка экрана: следующий опрос повторит. */
export async function fetchMediaAssets(companyId: string): Promise<MediaItem[] | null> {
  try {
    const response = await fetch('/api/dashboard/media', {
      headers: { 'x-company-id': companyId },
    })
    if (!response.ok) return null

    const data = (await response.json()) as { assets: MediaItem[] }
    return data.assets
  } catch {
    return null
  }
}

export type MediaUploadResult =
  | { kind: 'ok'; assetId: string | null; state: MediaItem['state'] | null }
  | { kind: 'duplicate' }
  | { kind: 'error'; message: string }
  | { kind: 'network'; message: string }

/** Загрузка одного файла. Дедупликацию сервер сообщает отдельным флагом. */
export async function uploadMediaFile(companyId: string, file: File): Promise<MediaUploadResult> {
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

    const data = (await response.json().catch(() => null)) as {
      deduplicated?: boolean
      assetId?: string
      state?: MediaItem['state']
    } | null

    if (data?.deduplicated) return { kind: 'duplicate' }

    return { kind: 'ok', assetId: data?.assetId ?? null, state: data?.state ?? null }
  } catch {
    return { kind: 'network', message: `Сервер недоступен при загрузке ${file.name}` }
  }
}

export type MediaDeleteResult =
  | { kind: 'ok' }
  | { kind: 'blocked'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'network'; message: string }

/**
 * Удаление файла.
 *
 * 409 — файл входит в плейлист. Это не ошибка, а предупреждение: показываем,
 * чем занят файл, и просим подтвердить удаление явно.
 */
export async function deleteMediaAsset(
  companyId: string,
  assetId: string,
  force: boolean,
): Promise<MediaDeleteResult> {
  const params = new URLSearchParams({
    companyId,
    assetId,
    ...(force ? { force: 'true' } : {}),
  })

  try {
    const response = await fetch(`/api/dashboard/media/file?${params.toString()}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': readCsrfToken() },
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (response.status === 409) {
        return { kind: 'blocked', message: data?.error?.message ?? 'Файл используется' }
      }

      return { kind: 'error', message: data?.error?.message ?? 'Не удалось удалить файл' }
    }

    return { kind: 'ok' }
  } catch {
    return { kind: 'network', message: 'Сервер недоступен при удалении файла' }
  }
}
