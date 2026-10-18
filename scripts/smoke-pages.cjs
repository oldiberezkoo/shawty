const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'
let cookies = ''
let csrf = ''

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: cookies ? { cookie: cookies } : {}, redirect: 'manual' })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0]
    cookies = cookies ? `${cookies}; ${pair}` : pair
  }
  return { status: res.status, text: await res.text() }
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
    body: JSON.stringify({ email: 'owner@shawty.uz', password: 'demo1234' }),
  })

  for (const c of login.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0]
    cookies = cookies ? `${cookies}; ${pair}` : pair
    if (pair.startsWith('shawty_csrf=')) csrf = decodeURIComponent(pair.slice('shawty_csrf='.length))
  }

  const checks = [
    ['/login', ['SHAWTY']],
    ['/dashboard', ['Обзор сети', 'Всего экранов']],
    ['/dashboard/screens', ['Экраны', 'Demo Retail']],
    ['/dashboard/media', ['Медиатека', 'Хранилище']],
    ['/dashboard/playlists', ['Плейлисты']],
    ['/dashboard/releases', ['Публикация', 'Отправлено', 'Применили', 'Нет связи']],
    ['/dashboard/campaigns', ['Кампании', 'Новая кампания', 'Окна показа']],
    ['/dashboard/scheduling', ['Расписание', 'Что и когда идёт на экранах']],
    ['/pair', ['Порядок действий']],
    ['/player/pairing', ['SHAWTY']],
  ]

  let failed = 0

  for (const [path, expected] of checks) {
    const res = await get(path)
    const missing = expected.filter((needle) => !res.text.includes(needle))
    const ok = res.status === 200 && missing.length === 0
    if (!ok) failed += 1
    console.log(`${ok ? '✓' : '✗'} ${path} -> ${res.status}`, missing.length ? `| нет: ${missing.join(', ')}` : '')
  }

  // Плеер обязан существовать: раньше он уводил на 404 сразу после привязки.
  const player = await get('/player/display')
  console.log(`${player.status === 200 ? '✓' : '✗'} /player/display -> ${player.status} (страница существует)`)
  if (player.status !== 200) failed += 1

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('сбой:', error)
  process.exit(1)
})
