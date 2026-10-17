/** Проверка отрендеренных страниц: статус и наличие ожидаемого содержимого. */
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'
let cookies = ''

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookies ? { cookie: cookies } : {},
    redirect: 'manual',
  })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0]
    cookies = cookies ? `${cookies}; ${pair}` : pair
  }
  return { status: res.status, text: await res.text() }
}

const checks = [
  ['/login', ['SHAWTY', 'Вход в панель управления']],
  ['/dashboard', ['Обзор сети', 'Всего экранов', 'Подписка', 'Быстрые действия']],
  ['/dashboard/screens', ['Экраны', 'Demo Retail', 'Heartbeat']],
  ['/pair', ['Порядок действий', 'player/pairing']],
  ['/player/pairing', ['Подготовка', 'SHAWTY']],
]

async function main() {
  await get('/login')

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
    body: JSON.stringify({ email: 'owner@shawty.uz', password: 'demo1234' }),
  })
  for (const c of login.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0]
    cookies = cookies ? `${cookies}; ${pair}` : pair
  }
  console.log('вход:', login.status)

  let failed = 0
  for (const [path, expected] of checks) {
    const res = await get(path)
    const missing = expected.filter((needle) => !res.text.includes(needle))
    const ok = res.status === 200 && missing.length === 0
    if (!ok) failed += 1
    console.log(
      `${ok ? '✓' : '✗'} ${path} -> ${res.status}`,
      missing.length ? `| не найдено: ${missing.join(', ')}` : '',
    )
  }

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
