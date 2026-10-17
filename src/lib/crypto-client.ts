/**
 * Генерация случайных байтов в браузере.
 *
 * Отдельный модуль от `src/lib/crypto.ts`: там используется `node:crypto`,
 * который нельзя тащить в код, исполняемый на телевизоре.
 *
 * `crypto.getRandomValues` — единственный источник энтропии, доступный
 * в браузере, включая старые телевизорные. `Math.random` непригоден:
 * его вывод предсказуем, а nonce привязки обязан быть непредсказуемым.
 */
export function randomBytesOf(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Случайная строка в URL-safe base64 без паддинга.
 *
 * `Uint8Array.prototype.toString` не умеет base64 — нужен ручной разбор
 * по 3 байта. Зависимость ради этого не подключаем.
 */
export function randomBase64Url(size: number): string {
  const bytes = randomBytesOf(size)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = bytes[i + 1] ?? 0
    const b2 = bytes[i + 2] ?? 0

    out += alphabet[b0 >> 2]
    out += alphabet[((b0 & 0x03) << 4) | (b1 >> 4)]
    out += alphabet[((b1 & 0x0f) << 2) | (b2 >> 6)]
    out += alphabet[b2 & 0x3f]
  }

  return out
}
