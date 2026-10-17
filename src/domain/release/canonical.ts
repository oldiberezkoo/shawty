import type { PlayerManifest } from '@/player/engine'

/**
 * Каноническое представление манифеста для хеша.
 *
 * Отдельный модуль без зависимостей, потому что его используют обе стороны:
 * сервер считает им хеш при сборке, плеер — при проверке. Если строки
 * разойдутся хоть на пробел, проверка всегда будет давать «подменено».
 *
 * Порядок ключей задан явно: JSON.stringify зависит от порядка вставки,
 * а манифесты должны давать одинаковый хеш в разных процессах.
 */
export function canonicalManifestJson(manifest: PlayerManifest): string {
  return JSON.stringify({
    version: manifest.version,
    screenId: manifest.screenId,
    items: manifest.items.map((item) => ({
      id: item.id,
      url: item.url,
      durationMs: item.durationMs,
      kind: item.kind,
      mime: item.mime,
    })),
  })
}
