/**
 * Медиатека: дедупликация и имя файла.
 *
 * Здесь закрывается баг, найденный сквозной проверкой: повторная загрузка
 * файла, который ещё обрабатывается, падала с 500 на уникальном индексе.
 * Ошибка проявлялась ровно тогда, когда человек перетаскивал в медиатеку
 * несколько файлов сразу, — то есть в обычной работе, а не в крае��ом случае.
 *
 * Второе, что проверяется здесь, — имя файла. Без него две карточки одного
 * формата и разрешения неразличимы, и выбрать нужный файл невозможно.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import { companies, mediaAssets, plans, subscriptions, users } from '@/db/schema'
import { hashPassword } from '@/lib/crypto'
import { ingestUpload, listMedia } from '@/server/services/media-service'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const COMPANY = 'cmp_media_dedup'
const ACTOR = 'usr_media_dedup'
const TMP = join(tmpdir(), 'shawty-media-dedup')

/** Настоящий PNG 1×1: формат определяется по сигнатуре, а не по расширению. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function wipeAllTables(): void {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all() as { name: string }[]

  sqlite.pragma('foreign_keys = OFF')
  for (const row of rows) sqlite.exec(`DELETE FROM "${row.name}"`)
  sqlite.pragma('foreign_keys = ON')
}

function seedFixture(): void {
  db.insert(users)
    .values({ id: ACTOR, email: 'media@dedup.test', passwordHash: hashPassword('demo1234'), name: 'Медиа' })
    .run()

  db.insert(companies)
    .values({ id: COMPANY, slug: 'media-dedup', name: 'Медиа', timezone: 'Asia/Tashkent' })
    .run()

  // Подписка нужна не формально: квота хранилища считается по тарифу, и без
  // него любая загрузка отвергается с «нет активной подписки».
  db.insert(plans)
    .values({
      id: 'plan_media_dedup',
      name: 'Test',
      screensLimit: 10,
      branchesLimit: 10,
      storageBytesLimit: 1024 ** 3,
      seatsLimit: 5,
      eventRetentionDays: 30,
      monthlyPriceCents: 0,
      currency: 'UZS',
    })
    .run()

  db.insert(subscriptions)
    .values({
      id: 'sub_media_dedup',
      companyId: COMPANY,
      planId: 'plan_media_dedup',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .run()
}

/** Файл на диске: обработка читает его по сигнатуре, а не по имени. */
function tempFile(name: string): string {
  mkdirSync(TMP, { recursive: true })
  const path = join(TMP, name)
  writeFileSync(path, PNG)
  return path
}

beforeEach(() => {
  wipeAllTables()
  seedFixture()
})

describe('дедупликация', () => {
  it('тот же файл не добавляется второй раз', async () => {
    const first = await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('a.png'),
      fileName: 'banner.png',
    })

    expect(first.deduplicated).toBe(false)

    const second = await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('b.png'),
      fileName: 'banner-copy.png',
    })

    expect(second.deduplicated).toBe(true)
    expect(second.assetId).toBe(first.assetId)
    expect(listMedia(COMPANY)).toHaveLength(1)
  })

  it('файл, который ещё обрабатывается, не роняет повторную загрузку', async () => {
    // Именно этот случай давал 500: ассет уже лежал в базе, но ещё не был
    // готов, код проверял только `ready` и уходил во вставку, которую
    // отбрасывал уникальный индекс по паре «компания + хеш».
    const first = await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('processing.png'),
      fileName: 'first.png',
    })

    expect(db.select().from(mediaAssets).where(eq(mediaAssets.id, first.assetId)).get()?.state).toBe('processing')

    const second = await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('again.png'),
      fileName: 'second.png',
    })

    // Не 500, а тот же ассет: содержимое то же, ждать надо тот же самый.
    expect(second.deduplicated).toBe(true)
    expect(second.assetId).toBe(first.assetId)
  })

  it('файл после ошибки обработки загружается заново', async () => {
    const first = await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('broken.png'),
      fileName: 'broken.png',
    })

    db.update(mediaAssets).set({ state: 'failed', error: 'Не удалось прочитать' }).where(eq(mediaAssets.id, first.assetId)).run()

    const second = await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('fixed.png'),
      fileName: 'same-content.png',
    })

    // Хеш занят, но перезагрузка обязана работать: иначе после одной ошибки
    // файл пришлось бы переименовывать или заливать в другую компанию.
    expect(second.deduplicated).toBe(false)
    expect(second.assetId).not.toBe(first.assetId)
    expect(listMedia(COMPANY)).toHaveLength(1)
  })
})

describe('имя файла', () => {
  it('сохраняется и находится поиском', async () => {
    const result = await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('named.png'),
      fileName: 'logo-final-v2.png',
    })

    expect(listMedia(COMPANY)[0]?.fileName).toBe('logo-final-v2.png')
    expect(listMedia(COMPANY, { search: 'final-v2' })).toHaveLength(1)
    expect(listMedia(COMPANY, { search: 'нетакого' })).toHaveLength(0)

    void result
  })

  it('дубликат не переименовывает уже загруженный файл', async () => {
    await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('first.png'),
      fileName: 'original.png',
    })

    await ingestUpload({
      companyId: COMPANY,
      actorUserId: ACTOR,
      temporaryPath: tempFile('second.png'),
      fileName: 'other-name.png',
    })

    // Первый файл остаётся первым: переименование при дедупликации сделало бы
    // имя файла зависящим от порядка загрузок, а не от того, что лежит в базе.
    expect(listMedia(COMPANY)[0]?.fileName).toBe('original.png')
  })
})