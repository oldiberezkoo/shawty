/**
 * Сквозная проверка цепочки «плейлист → назначение → публикация → доставка».
 *
 * Это сценарий, ради которого написан продукт: оператор публикует контент
 * и видит не «Опубликовано», а состояние каждого экрана.
 *
 * Требует запущенного dev-сервера. Использование: node scripts/smoke-release.cjs
 */
const { WebSocket } = require('ws')
const Database = require('better-sqlite3')
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4000'
const DB = new Database(process.env.DATABASE_URL ?? require('node:path').resolve(__dirname, '../../../data/shawty.db'))
const COMPANY = 'cmp_demo_retail'

let cookies = ''
let csrf = ''

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
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: res.status, data, text }
}

const api = (path, method, body) =>
  req(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-company-id': COMPANY, 'x-csrf-token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

function openDeviceSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws/device')
    const frames = []
    const waiters = []

    socket.on('message', (raw) => {
      let frame
      try {
        frame = JSON.parse(String(raw))
      } catch {
        return
      }
      frames.push(frame)
      for (const waiter of [...waiters]) {
        if (waiter.type === frame.type) {
          waiters.splice(waiters.indexOf(waiter), 1)
          waiter.resolve(frame)
        }
      }
    })

    socket.on('error', reject)
    socket.on('open', () =>
      resolve({
        socket,
        frames,
        send: (payload) => socket.send(JSON.stringify(payload)),
        waitFor(type, timeoutMs = 8000) {
          const existing = frames.find((f) => f.type === type)
          if (existing) return Promise.resolve(existing)
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`не дождались ${type}`)), timeoutMs)
            waiters.push({ type, resolve: (f) => { clearTimeout(timer); res(f) } })
          })
        },
        close: () => socket.close(),
      }),
    )
  })
}

/** Загружает картинку и дожидается готовности ассета. */
async function uploadFixture() {
  const { execFileSync } = require('node:child_process')
  const { mkdtempSync, rmSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'shawty-release-'))
  const image = join(dir, 'poster.png')

  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=0x0f766e:size=1280x720:duration=1',
    '-frames:v', '1', image,
  ])

  const { readFile } = require('node:fs/promises')
  const buffer = await readFile(image)
  const form = new FormData()
  form.set('file', new Blob([buffer], { type: 'image/png' }), 'poster.png')

  const upload = await req('/api/dashboard/media', {
    method: 'POST',
    headers: { 'x-company-id': COMPANY, 'x-csrf-token': csrf },
    body: form,
  })

  if (!upload.data?.assetId) {
    throw new Error(`файл не загружен: ${upload.text.slice(0, 200)}`)
  }

  const assetId = upload.data.assetId

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const row = DB.prepare('SELECT state FROM media_assets WHERE id = ?').get(assetId)
    if (row && row.state === 'ready') {
      rmSync(dir, { recursive: true, force: true })
      return { id: assetId }
    }
    if (row && row.state === 'failed') throw new Error('файл не обработался')
    await new Promise((r) => setTimeout(r, 500))
  }

  throw new Error('файл не обработался за отведённое время')
}

async function main() {
  const createdPlaylists = []

  try {
    const login = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
      body: JSON.stringify({ email: 'owner@shawty.uz', password: 'demo1234' }),
    })
    if (login.status !== 200) throw new Error(`вход не удался: ${login.status}`)
    console.log('✓ вход выполнен')

    // 1. Своя медиа-фикстура: скрипт не зависит от leftovers другого прогона.
    const asset = await uploadFixture()
    console.log('✓ загружен файл', asset.id.slice(0, 8) + '…')

    // 2. Плейлист: создать, наполнить, зафиксировать версию.
    const created = await api('/api/dashboard/playlists', 'POST', { name: 'Смоук релиз' })
    if (created.status !== 201) throw new Error(`плейлист не создан: ${created.text.slice(0, 200)}`)
    const playlistId = created.data.id
    createdPlaylists.push(playlistId)

    const added = await api(`/api/dashboard/playlists/${playlistId}/items`, 'POST', {
      assetIds: [asset.id],
      durationMs: 5000,
    })
    console.log('→ элементов добавлено:', added.data?.added)

    const published = await api(`/api/dashboard/playlists/${playlistId}/publish?companyId=${COMPANY}`, 'POST', {})
    if (published.status !== 200) throw new Error(`версия не зафиксирована: ${published.text.slice(0, 200)}`)
    console.log('→ версия зафиксирована:', published.data.version, '| цикл:', published.data.cycleDurationMs, 'мс')

    // 3. Назначение на всю компанию.
    const assigned = await api('/api/dashboard/releases', 'PUT', {
      scopeType: 'company',
      scopeId: COMPANY,
      playlistVersionId: published.data.versionId,
    })
    console.log('→ назначено экранов:', assigned.data?.screens)
    if (!assigned.data?.screens) throw new Error('назначение не сработало')

    // 4. Живой экран подключается к каналу ДО публикации — так проверяется доставка.
    const credential = await createDeviceForSmoke()
    const token = await req('/api/player/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: credential.deviceId, deviceSecret: credential.deviceSecret }),
    })
    if (token.status !== 200) throw new Error(`токен не выдан: ${token.text.slice(0, 200)}`)

    const device = await openDeviceSocket()
    device.send({ type: 'hello', accessToken: token.data.accessToken })
    const hello = await device.waitFor('hello.ok')
    console.log('→ экран на связи:', hello.screenId.slice(0, 8) + '…')

    // 5. Публикация. Ключевая проверка: манифест должен прийти ПО КАНАЛУ,
    // а не только по опросу состояния.
    const publish = await api('/api/dashboard/releases', 'POST', { reason: 'смоук-тест' })
    if (publish.status !== 200) throw new Error(`публикация не выполнена: ${publish.text.slice(0, 300)}`)

    const assignment = await device.waitFor('assignment', 10_000).catch(() => null)

    if (!assignment) {
      throw new Error('манифест не пришёл по каналу: насос доставки не отработал')
    }

    console.log(
      `→ манифест доставлен по каналу: версия ${assignment.releaseVersion}, ` +
        `материалов ${assignment.manifest?.items?.length ?? 0}`,
    )

    const summary = publish.data.summary
    console.log(
      `→ публикация ${publish.data.version}: отправлено ${summary.sent}, применили ${summary.applied}, ` +
        `грузят ${summary.downloading}, нет связи ${summary.noContact}, всего ${summary.total}`,
    )

    // 7. Состояние публикации для устройства: то, что реально получает ТВ.
    const state = await req('/api/player/state', {
      headers: { authorization: `Bearer ${token.data.accessToken}` },
    })
    if (state.status !== 200) throw new Error(`состояние не отдано: ${state.text.slice(0, 200)}`)

    const manifest = state.data.manifest
    console.log(
      `→ по опросу состояния: версия ${manifest?.version}, материалов ${manifest?.items?.length ?? 0}, ` +
        `хеш ${String(manifest?.manifestHash).slice(0, 12)}…`,
    )

    if (!manifest || !manifest.items || manifest.items.length === 0) {
      throw new Error('манифест пуст — телевизору нечего показывать')
    }

    // Манифест из канала и из опроса должны совпадать по содержимому:
    // иначе экран при перезагрузке получил бы другую программу.
    const channelHash = assignment.manifest?.manifestHash
    if (channelHash !== manifest.manifestHash) {
      throw new Error(`манифест по каналу и по опросу различаются: ${channelHash} != ${manifest.manifestHash}`)
    }
    console.log('→ манифесты по каналу и по опросу совпадают')

    // 7. Файл из манифеста должен реально отдаваться по пропуску.
    const item = manifest.items[0]
    const fileRes = await fetch(`${BASE}${item.url}`)
    console.log('→ файл по пропуску:', fileRes.status, fileRes.headers.get('content-type'))
    if (fileRes.status !== 200) throw new Error('файл не отдан по пропуску из манифеста')

    // Пропуск не должен работать для чужого файла.
    const forged = item.url.replace(/media\/(.+?)\?/, 'media/00000000-0000-0000-0000-000000000000?')
    const forgedRes = await fetch(`${BASE}${forged}`)
    console.log('→ пропуск подменён на чужой файл:', forgedRes.status, '(ожидается 410)')
    if (forgedRes.status === 200) throw new Error('пропуск работает для чужого файла')

    // 8. Подтверждение применения: панель должна увидеть «применили».
    device.send({
      type: 'applied',
      releaseVersion: manifest.version,
      manifestHash: manifest.manifestHash,
    })
    await new Promise((r) => setTimeout(r, 600))

    const applied = DB
      .prepare('SELECT state FROM delivery_receipts WHERE screen_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(hello.screenId)

    console.log('→ состояние чека доставки после ack:', applied?.state)
    if (applied?.state !== 'applied') throw new Error('подтверждение применения не записалось')

    const after = await api('/api/dashboard/releases?companyId=' + COMPANY, 'GET', undefined)
    console.log('→ сводка после подтверждения:', JSON.stringify(after.data?.summary))

    // 9. События воспроизведения. Плеер утверждает ровно то, что знает:
    // материал начал показываться и был показан целиком. Никаких «показов» —
    // счётчик показов был бы выдумкой, а не измерением.
    device.send({
      type: 'playback',
      event: 'started',
      itemId: item.id,
      releaseVersion: manifest.version,
      positionMs: 0,
    })
    device.send({
      type: 'playback',
      event: 'ended',
      itemId: item.id,
      releaseVersion: manifest.version,
      positionMs: item.durationMs,
    })
    await new Promise((r) => setTimeout(r, 600))

    const events = DB
      .prepare(
        'SELECT event, item_id, position_ms FROM playback_events WHERE screen_id = ? AND release_id IN (SELECT id FROM releases WHERE manifest_version = ?) ORDER BY at ASC',
      )
      .all(hello.screenId, manifest.version)

    console.log(
      '→ события воспроизведения:',
      events.map((e) => `${e.event}@${e.position_ms ?? 0}мс`).join(', ') || 'нет',
    )

    if (events.length !== 2 || events[0].event !== 'started' || events[1].event !== 'ended') {
      throw new Error(`события воспроизведения записаны неверно: ${JSON.stringify(events)}`)
    }

    const missingRelease = DB
      .prepare(
        'SELECT COUNT(*) AS n FROM playback_events WHERE screen_id = ? AND release_id IS NULL AND item_id = ?',
      )
      .get(hello.screenId, item.id)

    if (missingRelease.n > 0) {
      throw new Error('событие не связано с публикацией: release_id не найден')
    }
    console.log('→ событие связано с публикацией')

    device.close()
    console.log('\n✓ сквозная проверка публикации завершена')
  } finally {
    for (const id of createdPlaylists) {
      DB.prepare('DELETE FROM release_assignments WHERE playlist_version_id IN (SELECT id FROM playlist_versions WHERE playlist_id = ?)').run(id)
      DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(id)
      DB.prepare('DELETE FROM playlist_version_items WHERE version_id IN (SELECT id FROM playlist_versions WHERE playlist_id = ?)').run(id)
      DB.prepare('DELETE FROM playlist_versions WHERE playlist_id = ?').run(id)
      DB.prepare('DELETE FROM playlists WHERE id = ?').run(id)
    }
    DB.prepare("DELETE FROM screens WHERE name LIKE 'Релиз-смоук-%'").run()
    DB.prepare("DELETE FROM media_assets WHERE created_by_user_id IS NOT NULL AND state != 'archived' AND id NOT IN (SELECT media_asset_id FROM playlist_items)").run()
    DB.prepare('DELETE FROM rate_limit_buckets').run()
  }
}

/**
 * Создаёт экран с готовыми учётными данными напрямую в базе.
 *
 * Хеш секрета считается тем же способом, что и на сервере:
 * HMAC-SHA256, ключ — серверный секрет из data/.secret.
 */
function createDeviceForSmoke() {
  const { randomBytes, createHmac } = require('node:crypto')
  const { readFileSync } = require('node:fs')
  const { resolve } = require('node:path')

  const serverSecret =
    process.env.SERVER_SECRET ?? readFileSync(resolve(__dirname, '../../../data', '.secret'), 'utf8').trim()

  const hashSecret = (value) => createHmac('sha256', serverSecret).update(value).digest('hex')

  const deviceSecret = randomBytes(32).toString('base64url')

  // Тот же алфавит, что и на сервере, чтобы формат проходил проверку.
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = randomBytes(16)
  let deviceId = 'scr_'
  for (let i = 0; i < bytes.length; i += 1) {
    deviceId += alphabet[bytes[i] % alphabet.length]
  }

  const screenId = 'scr_smoke_' + randomBytes(8).toString('hex')

  DB.prepare(
    "INSERT INTO screens (id, company_id, branch_id, name, status, paired_at, created_at, updated_at, heartbeat_interval_sec, offline_after_sec) " +
      "VALUES (?, ?, 'brn_tashkent', 'Релиз-смоук', 'paired', ?, ?, ?, 30, 90)",
  ).run(screenId, COMPANY, Date.now(), Date.now(), Date.now())

  DB.prepare(
    'INSERT INTO device_credentials (id, screen_id, device_id, secret_hash, version, issued_at) VALUES (?, ?, ?, ?, 1, ?)',
  ).run(randomBytes(16).toString('hex'), screenId, deviceId, hashSecret(deviceSecret), Date.now())

  DB.prepare(
    'INSERT INTO screen_publications (screen_id, company_id, updated_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
  ).run(screenId, COMPANY, Date.now())

  return { screenId, deviceId, deviceSecret }
}

main().catch((err) => {
  console.error('✗ сбой:', err.message)
  process.exit(1)
})
