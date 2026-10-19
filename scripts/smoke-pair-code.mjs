/**
 * Подключение без сканирования QR — сквозной сценарий.
 *
 * Идёт по-настоящему: телевизор сам запрашивает сессию через
 * `/api/player/pairing/start` и получает настоящий код, оператор входит в
 * панель, вводит этот код руками и попадает на форму подтверждения.
 *
 * Раньше это было невозможно: страница подключения давала инструкцию «сходи на
 * телевизор, отсканируй, вернись с кодом», но поля для кода на ней не было —
 * форма подтверждения живёт по адресу с `sessionId`, который известен только
 * из QR.
 *
 * Запуск: node scripts/smoke-pair-code.cjs
 */
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'
const COMPANY = 'cmp_demo_retail'
const PASS = process.argv.includes('--pass')

let cookies = ''
let csrf = ''

function collect(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0]
    cookies = cookies ? `${cookies}; ${pair}` : pair
    if (pair.startsWith('shawty_csrf=')) csrf = decodeURIComponent(pair.slice('shawty_csrf='.length))
  }
}

let failed = 0

function check(name, ok, detail = '') {
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(path, { method = 'GET', body, headers = {}, useSession = true } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(useSession ? { cookie: cookies, 'x-company-id': COMPANY, 'x-csrf-token': csrf } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    // Ответ не JSON: для проверок достаточно кода и текста.
  }

  return { status: res.status, data, text }
}

// 1. Вход оператора в панель.
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@shawty.uz', password: 'demo1234' }),
})
collect(login)
check('вход в панель', login.status === 200, `статус ${login.status}`)

if (login.status !== 200) process.exit(1)

// 2. Страница подключения содержит поле ввода кода, а не только инструкцию.
const pairPage = await fetch(`${BASE}/pair`, { headers: { cookie: cookies } })
const pairHtml = await pairPage.text()
check('страница подключения отдаётся', pairPage.status === 200, `статус ${pairPage.status}`)
check('на странице есть восемь ячеек для кода', (pairHtml.match(/Символ \d из 8/g) ?? []).length === 8)
check('кнопка подтверждения на месте', pairHtml.includes('Подтвердить'))

// 3. Телевизор запрашивает сессию привязки — как настоящий.
const deviceNonce = crypto.randomUUID() + crypto.randomUUID() + crypto.randomUUID()

const started = await fetch(`${BASE}/api/player/pairing/start`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ deviceNonce }),
})
const startData = await started.json()
check('телевизор получил код', started.status === 200 && Boolean(startData.code), `код ${startData.code ? 'выдан' : 'не выдан'}`)

if (!startData.code) process.exit(1)

// 4. Оператор вводит этот код руками.
const found = await api('/api/dashboard/pairing/lookup', { method: 'POST', body: { code: startData.code } })
check('код найден без QR', found.status === 200 && Boolean(found.data?.sessionId), `статус ${found.status}`)
check('найдена именно своя сессия', found.data?.sessionId === startData.sessionId)

// 5. Код не из алфавита отвергается сразу, не доходя до поиска.
//    '00000000' не проходит проверку: нули исключены из алфавита, чтобы их
//    нельзя было спутать с буквой O при чтении с экрана.
const malformed = await api('/api/dashboard/pairing/lookup', { method: 'POST', body: { code: '00000000' } })
check('код не из алфавита отвергнут', malformed.status === 400, `статус ${malformed.status}`)

// 6. Корректный по алфавиту, но несуществующий код не находит сессию.
const unknown = await api('/api/dashboard/pairing/lookup', { method: 'POST', body: { code: '22222222' } })
check('несуществующий код отвергнут', unknown.status === 404, `статус ${unknown.status}`)

// 6. По найденному адресу открывается форма подтверждения с кодом.
const confirmPage = await fetch(`${BASE}/pair/${found.data.sessionId}?c=${startData.code}`, {
  headers: { cookie: cookies },
})
const confirmHtml = await confirmPage.text()
check('форма подтверждения открывается', confirmPage.status === 200, `статус ${confirmPage.status}`)
check('на форме есть выбор филиала', confirmHtml.includes('Филиал'))

console.log(failed === 0 ? '\nсценарий пройден' : `\nпровалено проверок: ${failed}`)
process.exit(failed === 0 ? 0 : 1)