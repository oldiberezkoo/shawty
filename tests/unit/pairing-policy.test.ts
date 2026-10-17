import { describe, expect, it } from 'vitest'
import {
  buildConfirmUrl,
  evaluateConfirm,
  evaluateWatch,
  hashPairingCode,
  isExpired,
  isLocked,
  isWellFormedCode,
  verifyPairingCode,
  type PairingSessionRecord,
} from '@/domain/pairing/policy'

const SECRET = 'серверный секрет для тестов, длиннее тридцати двух символов'

function session(overrides: Partial<PairingSessionRecord> = {}): PairingSessionRecord {
  return {
    id: 'SESSIONSESSION0000000000000',
    codeHash: '',
    status: 'pending',
    attempts: 0,
    maxAttempts: 8,
    expiresAt: new Date('2026-10-17T10:05:00.000Z'),
    ...overrides,
  }
}

const NOW = new Date('2026-10-17T10:00:00.000Z')
const CODE = 'ABCD2345'

function pendingWithCode(code = CODE, overrides: Partial<PairingSessionRecord> = {}) {
  const id = overrides.id ?? session().id
  return session({ ...overrides, id, codeHash: hashPairingCode(SECRET, id, code) })
}

describe('хеш кода подтверждения', () => {
  it('детерминирован для одной сессии и кода', () => {
    expect(hashPairingCode(SECRET, 'A', CODE)).toBe(hashPairingCode(SECRET, 'A', CODE))
  })

  it('различается для разных сессий: один код нельзя перенести на другую', () => {
    expect(hashPairingCode(SECRET, 'A', CODE)).not.toBe(hashPairingCode(SECRET, 'B', CODE))
  })

  it('различается для разных серверных секретов', () => {
    expect(hashPairingCode(SECRET, 'A', CODE)).not.toBe(hashPairingCode(`${SECRET}x`, 'A', CODE))
  })

  it('не содержит сам код', () => {
    expect(hashPairingCode(SECRET, 'A', CODE)).not.toContain(CODE)
  })

  it('нормализует ввод: регистр, пробелы и дефисы не важны', () => {
    const expected = hashPairingCode(SECRET, 'A', CODE)
    expect(hashPairingCode(SECRET, 'A', 'abcd-2345')).toBe(expected)
    expect(hashPairingCode(SECRET, 'A', '  abcd 2345 ')).toBe(expected)
  })

  it('отбрасывает символы вне алфавита, а не считает их ошибкой ввода', () => {
    // O, I, U и 0/1 не входят в алфавит: человек читает с экрана и ошибается.
    expect(hashPairingCode(SECRET, 'A', 'OILU01ABCD2345')).toBe(hashPairingCode(SECRET, 'A', CODE))
  })
})

describe('проверка кода', () => {
  it('принимает верный код', () => {
    const s = pendingWithCode()
    expect(verifyPairingCode(SECRET, s.id, CODE, s.codeHash)).toBe(true)
  })

  it('отклоняет неверный код той же длины', () => {
    const s = pendingWithCode()
    expect(verifyPairingCode(SECRET, s.id, 'ZZZZ2345', s.codeHash)).toBe(false)
  })

  it('не подтверждает код, перенесённый из другой сессии', () => {
    const a = pendingWithCode(CODE, { id: 'SESSIONAAAAAAAAAAAAAAA' })
    const b = pendingWithCode(CODE, { id: 'SESSIONBBBBBBBBBBBBBBB' })
    expect(verifyPairingCode(SECRET, b.id, CODE, a.codeHash)).toBe(false)
  })
})

describe('форма кода', () => {
  it('принимает корректный код длины 8', () => {
    expect(isWellFormedCode(CODE, 8)).toBe(true)
  })

  it('отклоняет код другой длины', () => {
    expect(isWellFormedCode('ABCD234', 8)).toBe(false)
    expect(isWellFormedCode('ABCD23456', 8)).toBe(false)
  })

  it('отклоняет символы вне алфавита', () => {
    expect(isWellFormedCode('ABCD2340', 8)).toBe(false)
    expect(isWellFormedCode('ABCD23IL', 8)).toBe(false)
  })
})

describe('срок действия кода', () => {
  it('код действует в момент истечения включительно', () => {
    expect(isExpired(session({ expiresAt: new Date('2026-10-17T10:05:00.000Z') }), NOW)).toBe(false)
  })

  it('код истёк через миллисекунду после срока', () => {
    expect(isExpired(session({ expiresAt: new Date('2026-10-17T10:04:59.999Z') }), NOW)).toBe(true)
  })
})

describe('блокировка по числу попыток', () => {
  it('не блокирует до исчерпания лимита', () => {
    expect(isLocked(session({ attempts: 7, maxAttempts: 8 }))).toBe(false)
  })

  it('блокирует на восьмой попытке', () => {
    expect(isLocked(session({ attempts: 8, maxAttempts: 8 }))).toBe(true)
  })
})

describe('решение о подтверждении', () => {
  it('разрешает верный код в срок', () => {
    const s = pendingWithCode()
    expect(evaluateConfirm(s, CODE, SECRET, NOW)).toEqual({ allowed: true })
  })

  it('сообщает, что сессии нет, и не отличает это от неверного кода по времени', () => {
    expect(evaluateConfirm(undefined, CODE, SECRET, NOW)).toEqual({
      allowed: false,
      reason: 'not_found',
    })
  })

  it('отклоняет неверный код', () => {
    const s = pendingWithCode()
    expect(evaluateConfirm(s, 'ZZZZ2345', SECRET, NOW)).toEqual({
      allowed: false,
      reason: 'invalid_code',
    })
  })

  it('не выдаёт подробностей о состоянии при неверном коде', () => {
    // Истёкшая и исчерпанная сессия с неверным кодом дают тот же ответ,
    // что и просто неверный код: иначе перебор можно ускорить подбором состояний.
    const expired = pendingWithCode(CODE, { expiresAt: new Date('2026-10-17T09:00:00.000Z') })
    const locked = pendingWithCode(CODE, { attempts: 8 })

    expect(evaluateConfirm(expired, 'ZZZZ2345', SECRET, NOW)).toEqual({
      allowed: false,
      reason: 'invalid_code',
    })
    expect(evaluateConfirm(locked, 'ZZZZ2345', SECRET, NOW)).toEqual({
      allowed: false,
      reason: 'invalid_code',
    })
  })

  it('отклоняет истёкшую сессию даже с верным кодом', () => {
    const s = pendingWithCode(CODE, { expiresAt: new Date('2026-10-17T09:59:59.999Z') })
    expect(evaluateConfirm(s, CODE, SECRET, NOW)).toEqual({ allowed: false, reason: 'expired' })
  })

  it('отклоняет исчерпанную сессию даже с верным кодом', () => {
    const s = pendingWithCode(CODE, { attempts: 8 })
    expect(evaluateConfirm(s, CODE, SECRET, NOW)).toEqual({ allowed: false, reason: 'locked' })
  })

  it('повторное подтверждение уже подтверждённой сессии отклоняется', () => {
    const s = pendingWithCode(CODE, { status: 'confirmed' })
    expect(evaluateConfirm(s, CODE, SECRET, NOW)).toEqual({
      allowed: false,
      reason: 'already_confirmed',
    })
  })

  it('отклоняет отклонённую и истёкшую метку статуса', () => {
    expect(evaluateConfirm(pendingWithCode(CODE, { status: 'rejected' }), CODE, SECRET, NOW)).toEqual({
      allowed: false,
      reason: 'expired',
    })
  })
})

describe('состояние ожидания на телевизоре', () => {
  it('показывает остаток времени', () => {
    expect(evaluateWatch(session(), NOW)).toEqual({ state: 'pending', remainingMs: 300_000 })
  })

  it('сообщает о подтверждении', () => {
    expect(evaluateWatch(session({ status: 'confirmed' }), NOW)).toEqual({ state: 'confirmed' })
  })

  it('закрывает ожидание по истечении срока', () => {
    const s = session({ expiresAt: new Date('2026-10-17T09:59:59.000Z') })
    expect(evaluateWatch(s, NOW)).toEqual({ state: 'expired' })
  })

  it('закрывает ожидание по исчерпании попыток', () => {
    expect(evaluateWatch(session({ attempts: 8 }), NOW)).toEqual({ state: 'expired' })
  })

  it('отсутствующая сессия выглядит как истёкшая, а не как ошибка', () => {
    expect(evaluateWatch(undefined, NOW)).toEqual({ state: 'expired' })
  })
})

describe('адрес подтверждения в QR', () => {
  it('без кода содержит только идентификатор сессии', () => {
    expect(buildConfirmUrl('https://shawty.uz', 'SID123')).toBe('https://shawty.uz/pair/SID123')
  })

  it('с кодом добавляет его в запрос', () => {
    expect(buildConfirmUrl('https://shawty.uz/', 'SID123', 'ABCD 2345')).toBe(
      'https://shawty.uz/pair/SID123?c=ABCD%202345',
    )
  })

  it('не тащит за собой слэш в конце адреса', () => {
    expect(buildConfirmUrl('https://shawty.uz///', 'SID')).toBe('https://shawty.uz/pair/SID')
  })
})
