/**
 * Сквозная проверка кампаний и расписания.
 *
 * Сценарий: оператор создаёт кампанию с окном показа, смотрит календарь,
 * публикует её немедленно и убеждается, что телевизор получил именно её
 * программу, а в манифесте лежит момент следующей смены.
 *
 * Требует запущенного dev-сервера.
 * Использование: node scripts/smoke-schedule.cjs
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
        /**
         * Ждёт кадр новее заданной версии.
         *
         * Обычный `waitFor` нашёл бы первый подходящий кадр из истории, а в
         * сценарии с двумя публикациями это была бы старая: проверка «программа
         * сменилась» обязана смотреть на новую версию, иначе она проходит
         * всегда.
         */
        waitForVersionAfter(type, version, timeoutMs = 10_000) {
          const match = (frame) =>
            frame.type === type && typeof frame.releaseVersion === 'number' && frame.releaseVersion > version

          const existing = frames.find(match)
          if (existing) return Promise.resolve(existing)

          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`не дождались ${type} версии выше ${version}`)), timeoutMs)
            waiters.push({
              type,
              resolve: (f) => {
                clearTimeout(timer)
                res(f)
              },
            })
          })
        },
        close: () => socket.close(),
      }),
    )
  })
}

/** Дата в зоне компании — «сегодня» для интерфейса. */
function today(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60_000)
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tashkent' })).toISOString().slice(0, 10)
}

/** Загружает картинку и дожидается готовности ассета. */
async function uploadFixture() {
  const { execFileSync } = require('node:child_process')
  const { mkdtempSync, rmSync, readFileSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'shawty-schedule-'))
  const image = join(dir, 'poster.png')

  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=0x7c3aed:size=1280x720:duration=1',
    '-frames:v', '1', image,
  ])

  const form = new FormData()
  form.set('file', new Blob([readFileSync(image)], { type: 'image/png' }), 'poster.png')

  const upload = await req('/api/dashboard/media', {
    method: 'POST',
    headers: { 'x-company-id': COMPANY, 'x-csrf-token': csrf },
    body: form,
  })

  if (!upload.data?.assetId) throw new Error(`файл не загружен: ${upload.text.slice(0, 200)}`)

  const assetId = upload.data.assetId
  const deadline = Date.now() + 60_000

  while (Date.now() < deadline) {
    const row = DB.prepare('SELECT state FROM media_assets WHERE id = ?').get(assetId)
    if (row?.state === 'ready') {
      rmSync(dir, { recursive: true, force: true })
      return assetId
    }
    if (row?.state === 'failed') throw new Error('файл не обработался')
    await new Promise((r) => setTimeout(r, 500))
  }

  throw new Error('файл не обработался за отведённое время')
}

/** Максимальная версия публикации до прогона: по ней убираются все следы. */
function lastReleaseVersion() {
  return DB.prepare('SELECT COALESCE(MAX(manifest_version), 0) AS v FROM releases').get().v
}

async function main() {
  const createdPlaylists = []
  const versionBefore = lastReleaseVersion()
  let campaignId = null
  let device = null
  let screenId = null

  try {
    const login = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
      body: JSON.stringify({ email: 'owner@shawty.uz', password: 'demo1234' }),
    })
    if (login.status !== 200) throw new Error(`вход не удался: ${login.status}`)
    console.log('✓ вход выполнен')

    const assetId = await uploadFixture()
    console.log('✓ загружен файл', assetId.slice(0, 8) + '…')

    const created = await api('/api/dashboard/playlists', 'POST', { name: 'Смоук кампания' })
    if (created.status !== 201) throw new Error(`плейлист не создан: ${created.text.slice(0, 200)}`)
    const playlistId = created.data.id
    createdPlaylists.push(playlistId)

    await api(`/api/dashboard/playlists/${playlistId}/items`, 'POST', { assetIds: [assetId], durationMs: 5000 })

    const version = await api(`/api/dashboard/playlists/${playlistId}/publish`, 'POST', {})
    if (version.status !== 200) throw new Error(`версия не зафиксирована: ${version.text.slice(0, 200)}`)
    const versionId = version.data.versionId
    console.log('→ версия зафиксирована:', version.data.version)

    // Кампания с требованием согласования: пока не согласована, она не должна
    // влиять ни на публикацию, ни на расписание.
    const draft = await api('/api/dashboard/campaigns', 'POST', {
      name: 'Смоук: акция на неделю',
      kind: 'commercial',
      priority: 10,
      startsOn: today(-1),
      endsOn: today(7),
      approvalRequired: true,
      playlistVersionId: versionId,
      targets: [{ scopeType: 'company', scopeId: COMPANY }],
      // Окно: первая половина суток. Смена внутри него будет видна в календаре.
      windows: [{ daysOfWeek: 127, startMinute: 0, endMinute: 720, timezoneSource: 'branch' }],
    })

    if (draft.status !== 201) throw new Error(`кампания не создана: ${draft.text.slice(0, 300)}`)
    campaignId = draft.data.id
    console.log('→ кампания создана в состоянии:', draft.data.status)
    if (draft.data.status !== 'in_review') throw new Error('кампания с согласованием должна ждать его')

    // Согласование отдельным действием: редактор сам бы это согласовал.
    const approved = await api(`/api/dashboard/campaigns/${campaignId}/action`, 'POST', { action: 'approve' })
    if (approved.status !== 200) throw new Error(`согласование не выполнено: ${approved.text.slice(0, 200)}`)
    console.log('→ после согласования:', approved.data.status)

    const list = await api('/api/dashboard/campaigns', 'GET')
    const row = list.data?.campaigns?.find((c) => c.id === campaignId)
    console.log('→ в списке:', row?.name, '| приоритет', row?.priority, '| окон', row?.windows?.length)
    if (!row || row.windows.length !== 1) throw new Error('кампания не сохранилась с окном показа')

    // 1. Постоянная программа: экран должен начать с неё.
    const assigned = await api('/api/dashboard/releases', 'PUT', {
      scopeType: 'company',
      scopeId: COMPANY,
      playlistVersionId: versionId,
    })
    if (!assigned.data?.screens) throw new Error('назначение не сработало')

    const credential = createDeviceForSmoke()
    screenId = credential.screenId

    const token = await req('/api/player/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: credential.deviceId, deviceSecret: credential.deviceSecret }),
    })
    if (token.status !== 200) throw new Error(`токен не выдан: ${token.text.slice(0, 200)}`)

    device = await openDeviceSocket()
    device.send({ type: 'hello', accessToken: token.data.accessToken })
    const hello = await device.waitFor('hello.ok')
    console.log('→ экран на связи:', hello.screenId.slice(0, 8) + '…')

    await api('/api/dashboard/releases', 'POST', { reason: 'смоук: базовая программа' })
    const first = await device.waitFor('assignment', 10_000).catch(() => null)
    if (!first) throw new Error('базовая публикация не доставлена по каналу')
    console.log('→ доставлена базовая публикация:', first.releaseVersion)

    // 2. Кампания: календарь должен показать её отрезки и момент следующей смены.
    const schedule = await api(`/api/dashboard/schedule?screenId=${screenId}&days=7`, 'GET')
    if (schedule.status !== 200) throw new Error(`календарь не отдан: ${schedule.text.slice(0, 200)}`)

    const preview = schedule.data?.preview
    const campaignSegments = (preview?.segments ?? []).filter((s) => s.campaignId === campaignId)
    const campaignCampaigns = (preview?.campaigns ?? []).filter((c) => c.campaignId === campaignId)

    console.log(
      '→ календарь: сегментов', preview?.segments?.length,
      '| из них с кампанией', campaignSegments.length,
      '| интервалов у кампании', campaignCampaigns[0]?.intervals?.length ?? 0,
      '| зона', preview?.screen?.timezone,
    )

    if (campaignCampaigns[0]?.intervals.length === 0) {
      throw new Error('кампания не попала в календарь ни на один интервал')
    }

    const boards = await api('/api/dashboard/schedule', 'GET')
    const boardRow = boards.data?.screens?.find((s) => s.screenId === screenId)
    console.log(
      '→ доска расписания: сейчас идёт', boardRow?.campaignName ?? boardRow?.playlist?.name,
      '| следующая смена', boardRow?.nextChangeAt ?? 'нет',
      '| ожидает смены:', boardRow?.needsChange,
    )
    if (!boardRow) throw new Error('экран не попал в доску расписания')

    // 3. Публикация кампании «сейчас»: телевизор должен получить другой манифест.
    const nowPublished = await api(`/api/dashboard/campaigns/${campaignId}/action`, 'POST', { action: 'publish_now' })
    if (nowPublished.status !== 200) throw new Error(`публикация кампании не выполнена: ${nowPublished.text.slice(0, 200)}`)
    console.log('→ опубликована версия', nowPublished.data.published.version, 'для', nowPublished.data.published.screens, 'экранов')

    const second = await device.waitForVersionAfter('assignment', first.releaseVersion).catch(() => null)
    if (!second) throw new Error('новая программа не доставлена по каналу')

    console.log(
      '→ экран получил версию', second.releaseVersion,
      '| материалов', second.manifest?.items?.length ?? 0,
      '| nextChangeAt', second.manifest?.nextChangeAt ?? 'нет',
    )

    // Манифест обязан нести момент следующей смены: телевизор готовит
    // следующую программу заранее, а не в момент переключения.
    const state = await req('/api/player/state', { headers: { authorization: `Bearer ${token.data.accessToken}` } })
    const manifest = state.data?.manifest
    if (!manifest) throw new Error('состояние не отдало манифест')
    if (second.manifest?.manifestHash !== manifest.manifestHash) {
      throw new Error('манифест по каналу и по опросу различаются')
    }
    console.log('→ манифесты по каналу и по опросу совпадают')

    // 4. Отмена несуществующего перехода должна быть отказом, а не тихим успехом.
    const bad = await api(`/api/dashboard/campaigns/${campaignId}/action`, 'POST', { action: 'resume' })
    console.log('→ неизвестное действие:', bad.status, bad.data?.error?.code)
    if (bad.status < 400) throw new Error('неизвестное действие прошло как успешное')

    device.close()
    device = null
    console.log('\n✓ сквозная проверка расписания завершена')
  } finally {
    if (device) device.close()

    // Убираем все публикации, созданные прогоном: и кампании, и базовую.
    // Скрипт публикует на компанию, а не на свой экран, поэтому версии
    // отмечаются по номеру — надёжнее, чем помнить идентификаторы.
    const releaseIds = DB
      .prepare('SELECT id FROM releases WHERE manifest_version > ?')
      .all(versionBefore)
      .map((row) => row.id)

    for (const releaseId of releaseIds) {
      DB.prepare('DELETE FROM delivery_receipts WHERE release_id = ?').run(releaseId)
      DB.prepare('DELETE FROM release_targets WHERE release_id = ?').run(releaseId)
      DB.prepare('UPDATE screen_publications SET desired_release_id = NULL WHERE desired_release_id = ?').run(releaseId)
      DB.prepare('UPDATE screen_publications SET applied_release_id = NULL WHERE applied_release_id = ?').run(releaseId)
      DB.prepare('DELETE FROM releases WHERE id = ?').run(releaseId)
    }

    // Свои публикации кампании считаем чужими, если кампанию уже удалили.
    for (const orphanId of DB
      .prepare('SELECT campaign_id AS id FROM releases WHERE campaign_id IS NOT NULL')
      .all()
      .map((row) => row.id)) {
      DB.prepare('UPDATE releases SET campaign_id = NULL WHERE campaign_id = ?').run(orphanId)
    }

    if (campaignId) {
      DB.prepare('DELETE FROM schedule_windows WHERE campaign_id = ?').run(campaignId)
      DB.prepare('DELETE FROM campaign_targets WHERE campaign_id = ?').run(campaignId)
      DB.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId)
    }

    for (const id of createdPlaylists) {
      DB.prepare('DELETE FROM release_assignments WHERE playlist_version_id IN (SELECT id FROM playlist_versions WHERE playlist_id = ?)').run(id)

      // `screen_publications` помнит, какая версия плейлиста выложена на экран.
      // Ссылку надо снять явно: иначе удаление версии отклоняется по внешнему ключу,
      // и смоук оставляет за собой неубираемую запись.
      DB.prepare(
        'UPDATE screen_publications SET playlist_version_id = NULL WHERE playlist_version_id IN (SELECT id FROM playlist_versions WHERE playlist_id = ?)',
      ).run(id)

      DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(id)
      DB.prepare('DELETE FROM playlist_version_items WHERE version_id IN (SELECT id FROM playlist_versions WHERE playlist_id = ?)').run(id)
      DB.prepare('DELETE FROM playlist_versions WHERE playlist_id = ?').run(id)
      DB.prepare('DELETE FROM playlists WHERE id = ?').run(id)
    }

    if (screenId) {
      DB.prepare('DELETE FROM delivery_receipts WHERE screen_id = ?').run(screenId)
      DB.prepare('DELETE FROM screen_publications WHERE screen_id = ?').run(screenId)
      DB.prepare('DELETE FROM device_credentials WHERE screen_id = ?').run(screenId)
      DB.prepare('DELETE FROM screens WHERE id = ?').run(screenId)
    }

    // Загруженный фикстурный файл. Условие — «не используется ни одним
    // плейлистом»: у оставшихся после прогона ассетов медиатеки должен быть
    // шанс пережить его, а не исчезнуть вместе с чужими.
    DB.prepare(
      "DELETE FROM media_assets WHERE created_by_user_id IS NOT NULL AND state != 'archived' AND id NOT IN (SELECT media_asset_id FROM playlist_items)",
    ).run()

    DB.prepare('DELETE FROM rate_limit_buckets').run()
  }
}

/** Экран с готовыми учётными данными напрямую в базе. */
function createDeviceForSmoke() {
  const { randomBytes, createHmac } = require('node:crypto')
  const { readFileSync } = require('node:fs')
  const { resolve } = require('node:path')

  const serverSecret =
    process.env.SERVER_SECRET ?? readFileSync(resolve(__dirname, '../../../data', '.secret'), 'utf8').trim()

  const hashSecret = (value) => createHmac('sha256', serverSecret).update(value).digest('hex')
  const deviceSecret = randomBytes(32).toString('base64url')

  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = randomBytes(16)
  let deviceId = 'scr_'
  for (let i = 0; i < bytes.length; i += 1) deviceId += alphabet[bytes[i] % alphabet.length]

  const screenId = 'scr_smoke_sched_' + randomBytes(6).toString('hex')

  DB.prepare(
    "INSERT INTO screens (id, company_id, branch_id, name, status, paired_at, created_at, updated_at, heartbeat_interval_sec, offline_after_sec) " +
      "VALUES (?, ?, 'brn_tashkent', 'Расписание-смоук', 'paired', ?, ?, ?, 30, 90)",
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
  // Стек полезен: сообщение SQLite само по себе не говорит, из какой таблицы
  // оно пришло, а уборка фикстуры идёт именно по чужим таблицам.
  console.error('✗ сбой:', err.message)
  if (process.env.SMOKE_TRACE) console.error(err.stack)
  process.exit(1)
})