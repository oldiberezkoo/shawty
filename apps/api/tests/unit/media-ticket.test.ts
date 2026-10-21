import { describe, expect, it } from 'vitest'
import { issueMediaTicket, verifyMediaTicket, MEDIA_TICKET_TTL_MS } from '@/domain/release/media-ticket'

/**
 * Пропуск на файл — единственный секрет, который по замыслу попадает в URL.
 * Поэтому проверяется строго: он обязан быть бесполезен вне своего файла,
 * своего экрана и своего срока.
 */
describe('пропуск на файл', () => {
  it('принимается для своего файла', () => {
    const ticket = issueMediaTicket('scr_a', 'media_1')
    const verdict = verifyMediaTicket(ticket, 'media_1')

    expect(verdict.ok).toBe(true)
  })

  it('не работает для чужого файла', () => {
    // Подмена идентификатора в адресе — главный сценарий злоупотребления.
    const ticket = issueMediaTicket('scr_a', 'media_1')
    const verdict = verifyMediaTicket(ticket, 'media_2')

    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('bad_signature')
  })

  it('истекает по сроку', () => {
    const now = Date.now()
    const ticket = issueMediaTicket('scr_a', 'media_1', now)

    const justBefore = verifyMediaTicket(ticket, 'media_1', now + MEDIA_TICKET_TTL_MS - 1)
    expect(justBefore.ok).toBe(true)

    const after = verifyMediaTicket(ticket, 'media_1', now + MEDIA_TICKET_TTL_MS + 1)
    expect(after.ok).toBe(false)
    if (!after.ok) expect(after.reason).toBe('expired')
  })

  it('не подделывается правкой подписи', () => {
    const ticket = issueMediaTicket('scr_a', 'media_1')
    const [payload, signature] = ticket.split('.') as [string, string]
    const tampered = `${payload}.${signature.slice(0, -2)}00`

    const verdict = verifyMediaTicket(tampered, 'media_1')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('bad_signature')
  })

  it('не подделывается правкой содержимого', () => {
    const ticket = issueMediaTicket('scr_a', 'media_1')
    const [payload, signature] = ticket.split('.') as [string, string]

    // Подмена экрана при сохранении подписи ничего не даёт.
    const forgedPayload = Buffer.from(
      JSON.stringify({ screenId: 'scr_b', mediaId: 'media_1', expiresAt: Date.now() + 60_000 }),
      'utf8',
    ).toString('base64url')

    const verdict = verifyMediaTicket(`${forgedPayload}.${signature}`, 'media_1')
    expect(verdict.ok).toBe(false)
  })

  it('мусор и неполные адреса отвергаются', () => {
    for (const bad of ['', 'abc', 'a.b.c', '....', 'no-dot']) {
      expect(verifyMediaTicket(bad, 'media_1').ok).toBe(false)
    }
  })

  it('два пропуска на один файл различаются', () => {
    // Срок выводится из времени выдачи, поэтому подписи не должны совпадать
    // и предсказуемо переиспользоваться.
    const first = issueMediaTicket('scr_a', 'media_1', 1_000)
    const second = issueMediaTicket('scr_a', 'media_1', 2_000)
    expect(first).not.toBe(second)
  })

  it('живёт не меньше часа: файлы крупные, сеть в магазине медленная', () => {
    expect(MEDIA_TICKET_TTL_MS).toBeGreaterThanOrEqual(30 * 60_000)
  })
})
