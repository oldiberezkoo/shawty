import { canonicalManifestJson } from './canonical'
import type { PlayerManifest } from '@/player/engine'

/**
 * Проверка целостности манифеста на устройстве.
 *
 * Вынесена отдельно от сборки, потому что выполняется в браузере: Web Crypto
 * доступен везде, а node:crypto — нет. Строка для хеша берётся из того же
 * канонизатора, что и на сервере, иначе хеши никогда не совпадут.
 *
 * Смысл проверки: повреждённый ответ сети или подмена на стороне прокси не
 * должны приводить к показу случайного набора файлов на экране в магазине.
 * Лучше показать предыдущий контент, чем непредсказуемый.
 */
export type ManifestIntegrity = { ok: true } | { ok: false; reason: 'hash_mismatch' | 'malformed' }

function isManifestLike(value: unknown): value is PlayerManifest {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<PlayerManifest>
  return typeof candidate.version === 'number' && Array.isArray(candidate.items)
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyManifest(manifest: unknown): Promise<ManifestIntegrity> {
  if (!isManifestLike(manifest)) {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof manifest.manifestHash !== 'string' || manifest.manifestHash.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  const expected = await sha256Hex(canonicalManifestJson(manifest))
  return expected === manifest.manifestHash ? { ok: true } : { ok: false, reason: 'hash_mismatch' }
}
