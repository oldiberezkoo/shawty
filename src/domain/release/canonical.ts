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
import type { PlayerManifest } from '@/player/engine'

/** Параметр подписи пропуска на файл. Сам пропуск в хеш не входит. */
const TICKET_PARAM = 't'

/**
 * Адрес без подписи пропуска.
 *
 * Пропуск выдаётся на час и перевыпускается при каждой сборке манифеста,
 * поэтому его наличие в хеше делало бы хеш невоспроизводимым: один и тот же
 * контент давал бы разные хеши при доставке по каналу и при опросе
 * состояния, и плеер не мог бы отличить смену программы от смены часа.
 *
 * При этом сам путь в хеш входит: он несёт идентификатор файла, и подмена
 * адреса по-прежнему ломает проверку. Действительность и срок пропуска
 * проверяет сервер при отдаче файла — это его работа, а не манифеста.
 */
function stableUrl(url: string): string {
  const at = url.indexOf('?')
  if (at < 0) return url

  const path = url.slice(0, at)
  const kept = url
    .slice(at + 1)
    .split('&')
    .filter((pair) => pair.split('=')[0] !== TICKET_PARAM)

  return kept.length > 0 ? `${path}?${kept.join('&')}` : path
}

export function canonicalManifestJson(manifest: PlayerManifest): string {
  return JSON.stringify({
    version: manifest.version,
    screenId: manifest.screenId,
    items: manifest.items.map((item) => ({
      id: item.id,
      url: stableUrl(item.url),
      durationMs: item.durationMs,
      kind: item.kind,
      mime: item.mime,
    })),
  })
}