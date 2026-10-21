/**
 * Пропуск на файл для плеера.
 *
 * Задача, которую он решает: `<img>` и `<video>` не умеют слать заголовок
 * авторизации, а требование продукта запрещает класть постоянный токен
 * устройства в URL — такой адрес попадает в историю браузера, логи и
 * сторонние инструменты аналитики.
 *
 * Решение: не одно, а два разных секрета.
 * - Постоянный секрет устройства ходит только в заголовке и в первом кадре
 *   канала. В URL он не попадает никогда.
 * - В URL попадает пропуск: подпись HMAC, связывающая экран, файл и срок
 *   действия. Он не даёт ничего, кроме чтения одного конкретного файла,
 *   живёт несколько минут и после смены публикации перестаёт быть нужным.
 *
 * Что он НЕ умеет: менять контент, видеть чужие файлы, продлевать срок,
 * работать после отзыва доступа. Проверка отзыва остаётся на сервере.
 */
import { hmacHex, safeEqual } from '@/lib/crypto'
import { loadOrCreateSecret } from '@/lib/secret-store'

/**
 * Срок жизни пропуска.
 *
 * Достаточно времени скачать файл и пережить обрыв сети, но мало для
 * того, чтобы адрес из логов оказался чем-то пригодным через неделю.
 * Файлы крупные и долго качаются на слабой сети магазина, поэтому час
 * с запасом; содержимое неизменяемо, так что повторная загрузка безопасна.
 */
export const MEDIA_TICKET_TTL_MS = 60 * 60_000

export type MediaTicketPayload = {
  screenId: string
  mediaId: string
  expiresAt: number
}

function ticketSecret(): string {
  return hmacHex(loadOrCreateSecret(), 'player-media-ticket')
}

export function issueMediaTicket(screenId: string, mediaId: string, now = Date.now()): string {
  const payload: MediaTicketPayload = {
    screenId,
    mediaId,
    expiresAt: now + MEDIA_TICKET_TTL_MS,
  }

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = hmacHex(ticketSecret(), encoded)
  return `${encoded}.${signature}`
}

export type TicketVerdict =
  | { ok: true; payload: MediaTicketPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

export function verifyMediaTicket(ticket: string, mediaId: string, now = Date.now()): TicketVerdict {
  const parts = ticket.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }

  const [encoded, signature] = parts as [string, string]

  // Подпись проверяется постоянным временем: иначе перебор укороченных
  // подписей занимает заметно меньше, чем проверка настоящей.
  if (!safeEqual(hmacHex(ticketSecret(), encoded), signature)) {
    return { ok: false, reason: 'bad_signature' }
  }

  let payload: MediaTicketPayload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as MediaTicketPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof payload.screenId !== 'string' || typeof payload.mediaId !== 'string') {
    return { ok: false, reason: 'malformed' }
  }

  // Пропуск жёстко привязан к файлу: подмена идентификатора в URL даёт
  // чужой файл, но подпись перестаёт совпадать.
  if (payload.mediaId !== mediaId) {
    return { ok: false, reason: 'bad_signature' }
  }

  if (payload.expiresAt <= now) {
    return { ok: false, reason: 'expired' }
  }

  return { ok: true, payload }
}
