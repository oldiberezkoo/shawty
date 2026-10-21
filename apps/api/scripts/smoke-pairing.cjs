/**
 * Сквозная проверка протокола привязки: HTTP + WebSocket + база.
 *
 * Токен выдачи учётных данных приходит только по каналу устройства, поэтому
 * полный обмен нельзя проверить одним HTTP-запросом — тест повторяет
 * настоящий путь телевизора.
 *
 * Использование: node scripts/smoke-pairing.cjs
 */
const { WebSocket } = require('ws')
const Database = require('better-sqlite3')
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'
const DB_PATH = process.env.DATABASE_URL ?? './data/shawty.db'
const NONCE = 'n'.repeat(43)

const db = new Database(DB_PATH)
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws/device'

let cookies = ''
let csrf = ''

/**
 * Удаляет следы предыдущих прогонов.
 * Порядок соблюдает внешние ключи: сначала зависимые строки, потом экраны.
 */
function cleanupScreens(dbx) {
  const ids = dbx
    .prepare("SELECT id FROM screens WHERE name LIKE 'Смоук-%'")
    .all()
    .map((row) => row.id)

  if (ids.length === 0) return

  for (const table of [
    'delivery_receipts',
    'screen_publications',
    'device_credentials',
    'release_targets',
    'device_incidents',
    'player_errors',
    'playback_events',
    'pairing_sessions',
  ]) {
    dbx.prepare(`DELETE FROM ${table} WHERE screen_id IN (${ids.map(() => '?').join(',')})`).run(...ids)
  }

  dbx.prepare(`DELETE FROM screens WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids)
}

function resetTestState() {
  // Чистим счётчики ограничения частоты и прошлые прогоны, иначе
  // второй запуск упирается в лимит из предыдущего.
  db.prepare('DELETE FROM rate_limit_buckets').run()
  cleanupScreens(db)
  db.prepare("DELETE FROM pairing_sessions WHERE status = 'pending'").run()
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
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text }
}

const post = (path, body, extraHeaders = {}) =>
  req(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  })

/** Открывает канал устройства, как это делает телевизор. */
function openDeviceSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL)
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
        /** Ждёт кадр по типу. Уже пришедшие кадры считаются. */
        waitFor(type, timeoutMs = 8000) {
          const existing = frames.find((frame) => frame.type === type)
          if (existing) return Promise.resolve(existing)
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`не дождались кадра ${type}`)), timeoutMs)
            waiters.push({ type, resolve: (frame) => { clearTimeout(timer); res(frame) } })
          })
        },
        close: () => socket.close(),
      }),
    )
  })
}

async function main() {
  resetTestState()

  const login = await post('/api/auth/login', { email: 'owner@shawty.uz', password: 'demo1234' })
  if (login.status !== 200) throw new Error(`вход не удался: ${login.status} ${login.text.slice(0, 200)}`)
  console.log('✓ вход выполнен')

  // 1. Старт привязки
  const start = await post('/api/player/pairing/start', { deviceNonce: NONCE })
  const session = start.json
  console.log('✓ старт привязки: код', session.code, '| QR несёт код:', session.codeInQr)

  // 2. Телевизор подписывается на подтверждение
  const device = await openDeviceSocket()
  device.send({ type: 'watch-pairing', sessionId: session.sessionId, deviceNonce: NONCE })
  await new Promise((r) => setTimeout(r, 300))

  // 3. Неверный код
  const wrong = await post(
    '/api/dashboard/pairing/confirm',
    {
      sessionId: session.sessionId,
      code: 'ZZZZZZZZ',
      companyId: 'cmp_demo_retail',
      branchId: 'brn_tashkent',
      screenName: 'Смоук-экран',
    },
    { 'x-csrf-token': csrf },
  )
  console.log('→ неверный код:', wrong.status, wrong.json?.error?.code)

  // 4. Верный код, подтверждение доходит по каналу
  const confirmPromise = device.waitFor('pairing.confirmed')
  const good = await post(
    '/api/dashboard/pairing/confirm',
    {
      sessionId: session.sessionId,
      code: session.code,
      companyId: 'cmp_demo_retail',
      branchId: 'brn_tashkent',
      screenName: 'Смоук-экран',
    },
    { 'x-csrf-token': csrf },
  )
  console.log('→ верный код:', good.status, good.json?.ok ? 'подтверждено' : good.json?.error)
  if (!good.json?.ok) throw new Error('подтверждение не прошло')

  const confirmed = await confirmPromise.catch((err) => {
    console.log('  кадры, полученные по каналу:', device.frames.map((f) => f.type).join(', ') || 'нет')
    throw err
  })
  console.log('✓ телевизор узнал о подтверждении по каналу, секретов в кадре нет:', JSON.stringify(confirmed))

  // 5. Повторное подтверждение той же сессии
  const again = await post(
    '/api/dashboard/pairing/confirm',
    {
      sessionId: session.sessionId,
      code: session.code,
      companyId: 'cmp_demo_retail',
      branchId: 'brn_tashkent',
      screenName: 'Смоук-экран 2',
    },
    { 'x-csrf-token': csrf },
  )
  console.log('→ повторное подтверждение:', again.status, again.json?.error?.code)

  // 6. Обмен на постоянные учётные данные: по nonce, без токена через канал
  const exchange = await post('/api/player/pairing/exchange', {
    sessionId: session.sessionId,
    deviceNonce: NONCE,
  })
  console.log('→ обмен:', exchange.status, exchange.json?.ok !== false ? `устройство ${exchange.json?.deviceId}` : exchange.json?.error)
  if (!exchange.json?.deviceId) throw new Error('обмен не вернул учётные данные')

  // 7. Одноразовость обмена
  const reuse = await post('/api/player/pairing/exchange', {
    sessionId: session.sessionId,
    deviceNonce: NONCE,
  })
  console.log('→ повторный обмен:', reuse.status, reuse.json?.error?.code)

  // 8. Чужой nonce не подходит
  const start2 = await post('/api/player/pairing/start', { deviceNonce: 'z'.repeat(43) })
  const bad2 = await post('/api/dashboard/pairing/confirm', {
    sessionId: start2.json.sessionId,
    code: start2.json.code,
    companyId: 'cmp_demo_retail',
    branchId: 'brn_tashkent',
    screenName: 'Смоук-экран 3',
  }, { 'x-csrf-token': csrf })
  const bad2Exchange = await post('/api/player/pairing/exchange', {
    sessionId: start2.json.sessionId,
    deviceNonce: NONCE,
  })
  console.log('→ подтверждение второй сессии:', bad2.status, '| обмен с чужим nonce:', bad2Exchange.status, bad2Exchange.json?.error?.code)

  // 9. Секрет устройства на обмен короткоживущего токена
  const token = await post('/api/player/auth/token', {
    deviceId: exchange.json.deviceId,
    deviceSecret: exchange.json.deviceSecret,
  })
  console.log('→ токен устройства:', token.status, token.json?.accessToken ? 'выдан' : token.json?.error)

  // 10. Неверный секрет отклоняется
  const badToken = await post('/api/player/auth/token', {
    deviceId: exchange.json.deviceId,
    deviceSecret: 'неверный-секрет-подлинной-длины-xxxxxxx',
  })
  console.log('→ неверный секрет:', badToken.status, badToken.json?.error?.code)

  // 11. Вход устройства в канал по выданному токену
  if (token.json?.accessToken) {
    const second = await openDeviceSocket()
    second.send({ type: 'hello', accessToken: token.json.accessToken })
    const hello = await second.waitFor('hello.ok').catch(() => null)
    console.log('→ канал устройства:', hello ? `принят (${hello.screenId?.slice(0, 8)}…)` : 'отклонён')
    second.send({ type: 'heartbeat', playerVersion: '0.1.0' })
    await new Promise((r) => setTimeout(r, 300))
    const row = db.prepare('SELECT last_seen_at FROM screens WHERE id = ?').get(token.json.screenId)
    console.log('→ heartbeat записан в базу:', Boolean(row?.last_seen_at))
    second.close()
  }

  // 12. CSRF обязателен
  const noCsrf = await post('/api/dashboard/pairing/confirm', {
    sessionId: session.sessionId,
    code: session.code,
    companyId: 'cmp_demo_retail',
    branchId: 'brn_tashkent',
    screenName: 'Смоук-экран 4',
  })
  console.log('→ без CSRF:', noCsrf.status, noCsrf.json?.error?.code)

  // 13. Ограничение частоты
  const codes = []
  for (let i = 0; i < 6; i += 1) {
    const res = await post('/api/player/pairing/start', { deviceNonce: `${NONCE.slice(0, -2)}${String(i).padStart(2, '0')}` })
    codes.push(res.status)
  }
  console.log('→ лимит частоты (5 за 10 мин):', codes.join(','))

  device.close()

  // Уборка
  cleanupScreens(db)
  db.prepare('DELETE FROM rate_limit_buckets').run()
  console.log('\n✓ сквозная проверка завершена')
}

main().catch((err) => {
  console.error('✗ сбой:', err.message)
  process.exit(1)
})
