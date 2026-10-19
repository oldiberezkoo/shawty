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

  // Отказ входа обязан останавливать прогон, а не продолжать его. Раньше скрипт
  // молча уходил дальше и выдавал пятнадцать строк `307`, где на самом деле
  // была одна причина: не удалось войти.
  if (login.status !== 200) {
    console.error(`вход не удался: ${login.status} ${await login.text()}`)
    process.exit(1)
  }

  const checks = [
    ['/login', ['SHAWTY']],
    ['/register', ['Создание учётной записи']],
    ['/join', ['Приглашение в компанию']],
    ['/dashboard', ['Обзор сети', 'Всего экранов']],
    ['/dashboard/screens', ['Экраны', 'Demo Retail']],
    ['/dashboard/media', ['Медиатека', 'Хранилище']],
    ['/dashboard/playlists', ['Плейлисты']],
    ['/dashboard/releases', ['Публикация', 'Отправлено', 'Применили', 'Нет связи']],
    ['/dashboard/campaigns', ['Кампании', 'Новая кампания', 'Окна показа']],
    ['/dashboard/scheduling', ['Расписание', 'Что и когда идёт на экранах']],
    ['/dashboard/monitoring', ['Мониторинг', 'Лента событий', 'Недоступность за период']],
    ['/dashboard/audit', ['Журнал действий']],
    ['/dashboard/team', ['Команда', 'Сотрудники', 'Роли и права']],
    ['/dashboard/billing', ['Тариф и потребление', 'Потребление', 'Смена тарифа']],
    ['/pair', ['Код с телевизора', 'Подтвердить']],
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
