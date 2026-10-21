/**
 * Сквозная проверка медиатеки: загрузка, дедупликация, обработка,
 * защита используемого файла, отдача с поддержкой Range.
 *
 * Требует запущенного dev-сервера. Использование: node scripts/smoke-media.cjs
 */
const Database = require('better-sqlite3')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, rmSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4000'
const DB = new Database(process.env.DATABASE_URL ?? require('node:path').resolve(__dirname, '../../../data/shawty.db'))
const COMPANY = 'cmp_demo_retail'

let cookies = ''
let csrf = ''

function cookieHeader() {
  return cookies
}

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...(options.headers ?? {}), ...(cookies ? { cookie: cookies } : {}) },
    redirect: 'manual',
  })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0]
    cookies = cookies ? `${cookies}; ${pair}` : pair
    if (pair.startsWith('shawty_csrf=')) csrf = decodeURIComponent(pair.slice('shawty_csrf='.length))
  }
  return res
}

async function json(path, options = {}) {
  const res = await req(path, options)
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: res.status, data, text }
}

function makeFixtures() {
  const dir = mkdtempSync(join(tmpdir(), 'shawty-media-'))

  const image = join(dir, 'poster.png')
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=0x1f6feb:size=1280x720:duration=1',
    '-frames:v', '1', image,
  ])

  // Ролик в НЕ-целевом кодеке: должен быть перекодирован в MP4/H.264.
  const video = join(dir, 'clip.webm')
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=25:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libvpx-vp9', '-b:v', '500k', '-c:a', 'libopus', '-shortest', video,
  ], { stdio: 'ignore' })

  const text = join(dir, 'fake.jpg')
  writeFileSync(text, '<?php echo "не картинка"; ?>'.padEnd(1024, ' '))

  const tiny = join(dir, 'tiny.mp4')
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=0.2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tiny,
  ])

  return { dir, image, video, text, tiny }
}

async function upload(path, fileName, mime) {
  const { readFile } = require('node:fs/promises')
  const buffer = await readFile(path)
  const form = new FormData()
  form.set('file', new Blob([buffer], { type: mime }), fileName)

  return json('/api/dashboard/media', {
    method: 'POST',
    headers: { 'x-company-id': COMPANY, 'x-csrf-token': csrf },
    body: form,
  })
}

async function waitForAsset(assetId, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = DB.prepare('SELECT * FROM media_assets WHERE id = ?').get(assetId)
    if (row && row.state !== 'processing') return row
    await new Promise((r) => setTimeout(r, 800))
  }
  throw new Error('ассет не обработался за отведённое время')
}

function cleanup(assetIds) {
  for (const id of assetIds) {
    DB.prepare("DELETE FROM playlist_items WHERE media_asset_id = ?").run(id)
    DB.prepare('DELETE FROM delivery_receipts WHERE screen_id IN (SELECT id FROM screens WHERE company_id = ? AND name LIKE ?)')
      .run(COMPANY, 'Медиа-смоук-%')
    DB.prepare("DELETE FROM screens WHERE name LIKE 'Медиа-смоук-%'").run()
    DB.prepare('DELETE FROM media_assets WHERE id = ?').run(id)
  }
}

async function main() {
  const fixtures = makeFixtures()
  const created = []

  try {
    await json('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
      body: JSON.stringify({ email: 'owner@shawty.uz', password: 'demo1234' }),
    })
    console.log('✓ вход выполнен')

    // 1. Подделка расширения: переименованный текст отвергается по содержимому
    const fake = await upload(fixtures.text, 'photo.jpg', 'image/jpeg')
    console.log('→ текст с именем .jpg:', fake.status, fake.data?.error?.code)
    if (fake.status === 200) throw new Error('подделка формата не отвергнута')

    // 2. Обрывок ролика отвергается
    const tiny = await upload(fixtures.tiny, 'tiny.mp4', 'video/mp4')
    console.log('→ ролик 0.2 с:', tiny.status, tiny.data?.error?.code)
    if (tiny.status === 200) throw new Error('слишком короткий ролик не отвергнут')

    // 3. Изображение принимается и обрабатывается
    const image = await upload(fixtures.image, 'poster.png', 'image/png')
    console.log('→ изображение:', image.status, 'deduplicated =', image.data?.deduplicated)
    created.push(image.data.assetId)

    const imageRow = await waitForAsset(image.data.assetId)
    console.log(`  состояние: ${imageRow.state}, ${imageRow.width}x${imageRow.height}, превью: ${Boolean(imageRow.poster_sha256)}`)
    if (imageRow.state !== 'ready') throw new Error('изображение не обработалось')
    if (!imageRow.poster_sha256) throw new Error('превью не создано')

    // 4. Повторная загрузка того же файла не создаёт новый ассет
    const again = await upload(fixtures.image, 'poster-copy.png', 'image/png')
    console.log('→ повторная загрузка:', again.status, 'deduplicated =', again.data?.deduplicated)
    if (!again.data?.deduplicated) throw new Error('дедупликация не сработала')
    if (again.data.assetId !== image.data.assetId) throw new Error('вернулся другой ассет')

    // 5. Видео в VP9/WebM перекодируется в MP4/H.264
    const video = await upload(fixtures.video, 'clip.webm', 'video/webm')
    console.log('→ видео webm:', video.status)
    created.push(video.data.assetId)

    const videoRow = await waitForAsset(video.data.assetId)
    console.log(
      `  состояние: ${videoRow.state}, mime: ${videoRow.mime}, перекодирован: ${Boolean(videoRow.transcoded)}, ` +
        `${videoRow.width}x${videoRow.height}, ${(videoRow.duration_ms / 1000).toFixed(1)} с`,
    )
    if (videoRow.state !== 'ready') throw new Error('видео не обработалось')
    if (videoRow.mime !== 'video/mp4') throw new Error('видео не приведено к MP4')
    if (!videoRow.transcoded) throw new Error('транскодирование не отмечено')

    const probe = JSON.parse(videoRow.probe_json)
    console.log(`  кодек после обработки: ${probe.videoCodec}, аудио: ${probe.audioCodec}`)
    if (probe.videoCodec !== 'h264') throw new Error(`кодек не h264, а ${probe.videoCodec}`)

    // 6. Файл отдаётся с поддержкой Range
    const rangeRes = await req(
      `/api/dashboard/media/file?companyId=${COMPANY}&assetId=${video.data.assetId}&variant=playback`,
      { headers: { range: 'bytes=0-1023' } },
    )
    const body = await rangeRes.arrayBuffer()
    console.log(
      `→ Range запрос: ${rangeRes.status}, content-range: ${rangeRes.headers.get('content-range')}, ` +
        `принято байт: ${body.byteLength}`,
    )
    if (rangeRes.status !== 206) throw new Error('сервер не ответил 206 на Range')
    if (body.byteLength !== 1024) throw new Error('Range вернул неверный объём')

    const fullRes = await req(`/api/dashboard/media/file?companyId=${COMPANY}&assetId=${video.data.assetId}`)
    console.log(`→ без Range: ${fullRes.status}, accept-ranges: ${fullRes.headers.get('accept-ranges')}`)

    // 7. Файл чужой компании недоступен
    const foreign = await json(
      `/api/dashboard/media/file?companyId=cmp_other&assetId=${image.data.assetId}&variant=playback`,
    )
    console.log('→ чужой companyId:', foreign.status, foreign.data?.error?.code)
    if (foreign.status === 200) throw new Error('доступ по чужой компании открыт')

    // 8. Защита используемого файла: кладём ассет в плейлист и рвёмся удалить
    const playlistId = 'pl_media_smoke'
    DB.prepare(
      'INSERT INTO playlists (id, company_id, name, state, created_at, updated_at) ' +
        "VALUES (?, ?, 'Медиа-смоук', 'draft', ?, ?) ON CONFLICT(id) DO NOTHING",
    ).run(playlistId, COMPANY, Date.now(), Date.now())
    DB.prepare(
      'INSERT INTO playlist_items (id, playlist_id, media_asset_id, position, play_policy, transition, audio, created_at) ' +
        "VALUES (?, ?, ?, 0, 'loop_once', 'none', 'mute', ?) ON CONFLICT(id) DO NOTHING",
    ).run('pli_media_smoke', playlistId, image.data.assetId, Date.now())

    const blocked = await json(
      `/api/dashboard/media/file?companyId=${COMPANY}&assetId=${image.data.assetId}`,
      { method: 'DELETE', headers: { 'x-csrf-token': csrf } },
    )
    console.log('→ удаление используемого файла:', blocked.status, blocked.data?.error?.code)
    if (blocked.status !== 409) throw new Error('используемый файл удалился')

    const rowAfter = DB.prepare('SELECT state FROM media_assets WHERE id = ?').get(image.data.assetId)
    console.log('  ассет на месте:', rowAfter.state === 'ready')
    if (rowAfter.state !== 'ready') throw new Error('ассет исчез после отказанного удаления')

    // 9. Принудительное удаление после подтверждения
    const forced = await json(
      `/api/dashboard/media/file?companyId=${COMPANY}&assetId=${image.data.assetId}&force=true`,
      { method: 'DELETE', headers: { 'x-csrf-token': csrf } },
    )
    console.log('→ принудительное удаление:', forced.status, forced.data?.ok)
    if (forced.status !== 200) throw new Error('принудительное удаление не сработало')

    console.log('\n✓ сквозная проверка медиатеки завершена')
  } finally {
    for (const id of created) {
      DB.prepare('DELETE FROM playlist_items WHERE media_asset_id = ?').run(id)
      DB.prepare('DELETE FROM media_assets WHERE id = ?').run(id)
    }
    DB.prepare("DELETE FROM playlists WHERE name LIKE 'Медиа-смоук%'").run()
    rmSync(fixtures.dir, { recursive: true, force: true })
    DB.prepare('DELETE FROM rate_limit_buckets').run()
    if (!existsSync(DB.name)) console.log('  (база отсутствует)')
  }
}

main().catch((err) => {
  console.error('✗ сбой:', err.message)
  process.exit(1)
})
