/**
 * Сборка манифеста публикации.
 *
 * Манифест — единственное, что видит телевизор. Он самодостаточен: плеер не
 * ходит в базу, не знает про компании, филиалы и кампании.
 *
 * Модуль серверный: считает хеш через node:crypto. Проверка на устройстве
 * живёт отдельно (release/verify.ts) и использует Web Crypto, поэтому в
 * браузерный бандл node-модули не попадают.
 */
import { sha256Hex } from '@/lib/crypto'
import { canonicalManifestJson } from './canonical'
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
  /**
   * Единая точка отсчёта для всех экранов одной публикации. Если не задана,
   * плеер откатывается к `since` — манифест остаётся совместимым.
   */
  syncEpoch?: Date | null
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
    syncEpoch: source.syncEpoch ? source.syncEpoch.toISOString() : null,
  }

  // Хеш считается по канонической строке без самого поля хеша: иначе
  // значение зависело бы от порядка вычисления и не было бы воспроизводимым.
  manifest.manifestHash = sha256Hex(canonicalManifestJson(manifest))

  return manifest
}

export function hashManifest(manifest: PlayerManifest): string {
  return sha256Hex(canonicalManifestJson(manifest))
}
