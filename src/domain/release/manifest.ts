/**
 * Сборка манифеста публикации.
 *
 * Манифест — это единственное, что видит телевизор. Он должен быть
 * самодостаточным: плеер не ходит в базу, не знает про компании, филиалы
 * и кампании. Всё, что нужно для показа, упаковано сюда.
 *
 * Манифест иммутабелен. Новая публикация — это новая версия с новым хешем,
 * поэтому плеер может применять её и подтверждать применение, не опасаясь,
 * что содержимое изменится под ним.
 */
import { sha256Hex } from '@/lib/crypto'
import { effectiveDurationMs, type PlaylistItemInput } from '@/domain/playlist/rules'
import type { PlayerItem, PlayerManifest } from '@/player/engine'

export type ManifestSource = {
  version: number
  screenId: string
  companyId: string
  items: {
    id: string
    kind: 'image' | 'video'
    assetDurationMs: number | null
    durationMs: number | null
    playPolicy: PlaylistItemInput['playPolicy']
    /** Адрес проигрываемого файла на сервере. */
    url: string
    mime: string
    transition: 'none' | 'fade'
    audio: 'keep' | 'mute'
  }[]
  nextChangeAt: Date | null
}

const DEFAULT_IMAGE_DURATION_MS = 8000

export function buildManifest(source: ManifestSource, now = new Date()): PlayerManifest {
  const items: PlayerItem[] = source.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    url: item.url,
    mime: item.mime,
    durationMs: effectiveDurationMs(item, DEFAULT_IMAGE_DURATION_MS),
    transition: item.transition,
    audio: item.audio,
  }))

  const manifest: PlayerManifest = {
    version: source.version,
    screenId: source.screenId,
    manifestHash: '',
    items,
    loop: true,
    nextChangeAt: source.nextChangeAt ? source.nextChangeAt.toISOString() : null,
    since: now.toISOString(),
  }

  // Хеш считаем по содержимому без самого поля хеша: иначе значение
  // зависело бы от порядка вычисления и не было бы воспроизводимым.
  manifest.manifestHash = hashManifest(manifest)

  return manifest
}

export function hashManifest(manifest: PlayerManifest): string {
  const canonical = {
    version: manifest.version,
    screenId: manifest.screenId,
    items: manifest.items.map((item) => ({
      id: item.id,
      url: item.url,
      durationMs: item.durationMs,
      kind: item.kind,
      mime: item.mime,
    })),
  }

  // Порядок ключей фиксирован: JSON.stringify зависит от порядка вставки,
  // а манифесты должны давать одинаковый хеш в разных процессах.
  return sha256Hex(JSON.stringify(canonical))
}

export type ManifestIntegrity = { ok: true } | { ok: false; reason: 'hash_mismatch' | 'malformed' }

/**
 * Проверка целостности на устройстве.
 *
 * Телевизор применяет только тот манифест, который совпал с хешем:
 * повреждённый ответ сети или подмена на стороне прокси не должны приводить
 * к показу случайного набора файлов.
 */
export function verifyManifest(manifest: unknown): ManifestIntegrity {
  if (typeof manifest !== 'object' || manifest === null) {
    return { ok: false, reason: 'malformed' }
  }

  const candidate = manifest as Partial<PlayerManifest>
  if (!Array.isArray(candidate.items) || typeof candidate.version !== 'number') {
    return { ok: false, reason: 'malformed' }
  }

  const expected = candidate.manifestHash
  if (typeof expected !== 'string' || expected.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  return hashManifest(candidate as PlayerManifest) === expected
    ? { ok: true }
    : { ok: false, reason: 'hash_mismatch' }
}
