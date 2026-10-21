import { afterEach, describe, expect, it, vi } from 'vitest'
import { CODE_ALPHABET, ID_LENGTH, bitsPerCodeChar, formatCode, normalizeCode, randomCode, randomDeviceId, randomDeviceSecret, randomSessionId } from '@/lib/ids'

describe('генерация идентификаторов', () => {
  it('идентификатор сессии даёт не менее 128 бит энтропии', () => {
    const id = randomSessionId()
    expect(id).toHaveLength(ID_LENGTH)
    expect(ID_LENGTH * bitsPerCodeChar()).toBeGreaterThanOrEqual(128)
  })

  it('идентификатор устройства отличается от идентификатора сессии по форме', () => {
    const id = randomDeviceId()
    expect(id.startsWith('scr_')).toBe(true)
    expect(id.slice(4)).toHaveLength(ID_LENGTH)
  })

  it('каждый символ идентификатора принадлежит алфавиту', () => {
    // Регрессия: побитовая упаковка по 5 бит при алфавите из 31 символа
    // выдавала индекс 31 и подставляла строку "undefined" вместо символа.
    for (let i = 0; i < 200; i += 1) {
      for (const char of randomSessionId()) {
        expect(CODE_ALPHABET).toContain(char)
      }
    }
  })

  it('код подтверждения даёт не менее 39 бит энтропии', () => {
    expect(randomCode(8)).toHaveLength(8)
    expect(8 * bitsPerCodeChar()).toBeGreaterThanOrEqual(39)
  })

  it('код состоит только из символов, читаемых с телевизора', () => {
    for (let i = 0; i < 200; i += 1) {
      for (const char of randomCode(8)) {
        expect(CODE_ALPHABET).toContain(char)
      }
    }
  })

  it('не содержит символов, которые путают при чтении', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01ILOU]/)
  })

  it('коды не повторяются на практике', () => {
    const codes = new Set(Array.from({ length: 5_000 }, () => randomCode(8)))
    expect(codes.size).toBe(5_000)
  })

  it('идентификаторы сессий уникальны', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => randomSessionId()))
    expect(ids.size).toBe(5_000)
  })

  it('секрет устройства — 256 бит в URL-safe виде', () => {
    const secret = randomDeviceSecret()
    expect(secret).toHaveLength(43)
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('нормализация кода при вводе', () => {
  it('приводит к верхнему регистру', () => {
    expect(normalizeCode('abcd2345')).toBe('ABCD2345')
  })

  it('убирает пробелы и дефисы', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345')
  })

  it('выбрасывает символы вне алфавита', () => {
    expect(normalizeCode('OILU01ABCD2345')).toBe('ABCD2345')
  })

  it('устойчив к мусорному вводу', () => {
    expect(normalizeCode('!@#$%^&*()')).toBe('')
  })

  it('группирует код для показа', () => {
    expect(formatCode('ABCD2345')).toBe('ABCD-2345')
  })
})

describe('настройки сервера по умолчанию', () => {
  const envKeys = [
    'PAIRING_CODE_TTL_MS',
    'PAIRING_MAX_ATTEMPTS',
    'PAIRING_QR_CARRIES_CODE',
    'PLAYER_OFFLINE_AFTER_SEC',
  ]

  afterEach(() => {
    for (const key of envKeys) delete process.env[key]
    vi.resetModules()
  })

  it('код подтверждения живёт ровно 5 минут — требование ТЗ', async () => {
    for (const key of envKeys) delete process.env[key]
    vi.resetModules()
    const { serverConfig } = await import('@/config/server')
    expect(serverConfig.pairing.codeTtlMs).toBe(5 * 60_000)
  })

  it('предел попыток ввода кода по умолчанию 8', async () => {
    for (const key of envKeys) delete process.env[key]
    vi.resetModules()
    const { serverConfig } = await import('@/config/server')
    expect(serverConfig.pairing.maxAttempts).toBe(8)
  })

  it('QR по умолчанию не содержит код — безопасный режим', async () => {
    for (const key of envKeys) delete process.env[key]
    vi.resetModules()
    const { serverConfig } = await import('@/config/server')
    expect(serverConfig.pairing.qrCarriesCode).toBe(false)
  })

  it('порог оффлайна не меньше 60 секунд: сеть магазина часто мигает', async () => {
    for (const key of envKeys) delete process.env[key]
    vi.resetModules()
    const { serverConfig } = await import('@/config/server')
    expect(serverConfig.player.offlineAfterSec).toBeGreaterThanOrEqual(60)
  })
})
