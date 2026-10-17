import { randomBytesOf } from './crypto'

/**
 * Алфавит для кодов, которые человек читает с экрана телевизора и вводит руками.
 * Исключены 0, 1, I, L, O, U — символы, которые путают при чтении с расстояния
 * и при вводе с пульта или экранной клавиатуры без автозамены.
 *
 * Намеренно 31 символ, а не 32: отбрасываем 0/1/I/L/O/U важнее круглой степени двойки.
 * Из-за этого алфавит не степень двойки и код строим выборкой с отсевом,
 * а не побитовой упаковкой — иначе индекс выходит за границу и появляются
 * символы вне алфавита.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Сколько случайных бит даёт один символ: log2(31) ≈ 4.954.
 * Считается от длины алфавита, а не захардкожено.
 */
export function bitsPerCodeChar(): number {
  return Math.log2(CODE_ALPHABET.length)
}

/** Число возможных кодов длиной length. */
export function spaceOf(length: number): number {
  return CODE_ALPHABET.length ** length
}

// Байты 248..255 отбрасываем: 248 = 31 * 8, поэтому каждый из 31 символов
// получает ровно 8 значений и распределение остаётся равномерным.
const UNBIASED_LIMIT = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length

/** Один равномерно выбранный символ алфавита. */
export function randomCodeChar(): string {
  for (;;) {
    const byte = randomBytesOf(1)[0]
    if (byte !== undefined && byte < UNBIASED_LIMIT) {
      return CODE_ALPHABET[byte % CODE_ALPHABET.length] as string
    }
  }
}

/** Строка из алфавита с равномерным распределением. */
export function randomCodeString(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += randomCodeChar()
  }
  return out
}

/** Идентификатор сессии привязки: 128 бит энтропии в 26 символах. */
export function randomSessionId(): string {
  return randomCodeString(26)
}

/** Публичный идентификатор устройства: `scr_` + 26 символов. */
export function randomDeviceId(): string {
  return `scr_${randomCodeString(26)}`
}

/** Короткий код подтверждения. 8 символов ≈ 39.6 бита. */
export function randomCode(length = 8): string {
  return randomCodeString(length)
}

/** Непрозрачный секрет устройства: 256 бит в URL-safe base64 без паддинга. */
export function randomDeviceSecret(): string {
  return randomBytesOf(32).toString('base64url')
}

/** Одноразовый токен выдачи учётных данных: 192 бита. */
export function randomEnrollmentToken(): string {
  return randomBytesOf(24).toString('base64url')
}

/** Токен пользовательской сессии: 256 бит, в БД хранится только хеш. */
export function randomSessionToken(): string {
  return randomBytesOf(32).toString('base64url')
}

export function randomCsrfSecret(): string {
  return randomBytesOf(32).toString('base64url')
}

/**
 * Приводит ввод пользователя к каноническому виду: верхний регистр и только
 * символы нашего алфавита. `abcd-efgh` и `ABCD EFGH` станут одним кодом,
 * а ошибочно прочитанные O/I/U/0/1 отбрасываются.
 */
export function normalizeCode(input: string): string {
  const upper = input.toUpperCase()
  let out = ''
  for (const char of upper) {
    if (CODE_ALPHABET.includes(char)) out += char
  }
  return out
}

/** Группировка для показа: `ABCD-EFGH`. */
export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-')
}

/** Группировка идентификатора устройства для показа: `scr_XXXXXX-XXXXXX-...`. */
export function formatDeviceId(deviceId: string): string {
  const body = deviceId.startsWith('scr_') ? deviceId.slice(4) : deviceId
  return `scr_${body.replace(/(.{6})(?=.)/g, '$1-')}`
}
