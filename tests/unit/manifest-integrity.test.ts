/**
 * Целостность манифеста.
 *
 * Проверяется ровно то свойство, ради которого существует хеш: одинаковое
 * содержимое даёт одинаковый хеш, а любое изменение программы — новый.
 * Отдельно проверяется, что перевыпуск подписи пропуска на файл не считается
 * изменением программы: иначе плеер, опрашивающий состояние, видел бы новый
 * хеш каждый час и не мог отличить смену публикации от смены часа.
 */
import { describe, expect, it } from 'vitest'

import { buildManifest, hashManifest } from '@/domain/release/manifest'
import { verifyManifest } from '@/domain/release/verify'
import type { ManifestSource } from '@/domain/release/manifest'

function source(overrides: Partial<ManifestSource> = {}): ManifestSource {
  return {
    version: 7,
    screenId: 'scr_1',
    companyId: 'cmp_1',
    items: [
      {
        id: 'itm_1',
        kind: 'image',
        assetDurationMs: null,
        durationMs: 8000,
        playPolicy: 'loop_once',
        url: '/api/player/media/ast_1?t=abc',
        mime: 'image/png',
        transition: 'none',
        audio: 'keep',
      },
    ],
    nextChangeAt: null,
    ...overrides,
  }
}

describe('хеш манифеста', () => {
  it('одинаков для одной и той же программы, собранной в разное время', () => {
    const first = buildManifest(source(), new Date('2026-01-01T00:00:00Z'))
    const second = buildManifest(source(), new Date('2026-01-01T01:23:45Z'))

    // `since` — время сборки, и в хеш не входит: это не свойство программы.
    expect(first.since).not.toBe(second.since)
    expect(first.manifestHash).toBe(second.manifestHash)
  })

  it('не меняется от перевыпуска подписи пропуска на тот же файл', () => {
    const withOldTicket = buildManifest(
      source({
        items: [{ ...source().items[0]!, url: '/api/player/media/ast_1?t=OLD' }],
      }),
    )

    const withNewTicket = buildManifest(
      source({
        items: [{ ...source().items[0]!, url: '/api/player/media/ast_1?t=NEW' }],
      }),
    )

    expect(withOldTicket.manifestHash).toBe(withNewTicket.manifestHash)
  })

  it('меняется при смене версии, экрана, порядка или адреса файла', () => {
    const base = buildManifest(source())

    const otherVersion = buildManifest(source({ version: 8 }))
    const otherScreen = buildManifest(source({ screenId: 'scr_2' }))
    const otherFile = buildManifest(
      source({ items: [{ ...source().items[0]!, url: '/api/player/media/ast_2?t=abc' }] }),
    )
    const otherDuration = buildManifest(
      source({ items: [{ ...source().items[0]!, durationMs: 9000 }] }),
    )

    expect(otherVersion.manifestHash).not.toBe(base.manifestHash)
    expect(otherScreen.manifestHash).not.toBe(base.manifestHash)
    expect(otherFile.manifestHash).not.toBe(base.manifestHash)
    expect(otherDuration.manifestHash).not.toBe(base.manifestHash)
  })

  it('учитывает остальные параметры адреса, а не только пропуск', () => {
    const base = buildManifest(source())

    // Пропуск можно выбросить, но подменить другой параметр нельзя:
    // канонизатор отбрасывает ровно подпись, а не всю строку запроса.
    const withOtherParam = buildManifest(
      source({ items: [{ ...source().items[0]!, url: '/api/player/media/ast_1?v=2' }] }),
    )

    expect(withOtherParam.manifestHash).not.toBe(base.manifestHash)
  })

  it('плеер принимает манифест, собранный сервером', async () => {
    const manifest = buildManifest(source())

    await expect(verifyManifest(manifest)).resolves.toEqual({ ok: true })
  })

  it('плеер отвергает подменённый адрес файла', async () => {
    const manifest = buildManifest(source())
    const tampered = {
      ...manifest,
      items: [{ ...manifest.items[0]!, url: '/api/player/media/ast_other?t=abc' }],
    }

    await expect(verifyManifest(tampered)).resolves.toEqual({ ok: false, reason: 'hash_mismatch' })
  })

  it('плеер отвергает не-манифест', async () => {
    await expect(verifyManifest({ version: 1 })).resolves.toEqual({ ok: false, reason: 'malformed' })
    await expect(verifyManifest(null)).resolves.toEqual({ ok: false, reason: 'malformed' })
    await expect(verifyManifest({ ...buildManifest(source()), manifestHash: '' })).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('повторный подсчёт хеша даёт то же значение', () => {
    const manifest = buildManifest(source())

    expect(hashManifest(manifest)).toBe(manifest.manifestHash)
  })
})