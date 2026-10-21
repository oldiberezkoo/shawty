/**
 * Проверка HTTP-контура API: вход, сессия, данные дашборда и старт привязки.
 * Использование: node scripts/smoke-http.cjs
 *
 * Веб проверяется отдельно — scripts/smoke-pages.cjs.
 */
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4000'
const COMPANY = 'cmp_demo_retail'

async function main() {
  let cookies = ''

  async function req(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { ...(options.headers ?? {}), ...(cookies ? { cookie: cookies } : {}) },
      redirect: 'manual',
    })
    const setCookie = res.headers.getSetCookie?.() ?? []
    for (const c of setCookie) {
      const pair = c.split(';')[0]
      cookies = cookies ? `${cookies}; ${pair}` : pair
    }
    return res
  }

  const health = await req('/health')
  console.log('GET /health ->', health.status, (await health.text()).slice(0, 80))

  const login = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@shawty.uz', password: 'demo1234' }),
  })
  console.log('POST /api/auth/login ->', login.status, (await login.text()).slice(0, 120))
  console.log('cookies received:', cookies ? cookies.split(';').length : 0)

  const bad = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@shawty.uz', password: 'wrong' }),
  })
  console.log('POST /api/auth/login (wrong password) ->', bad.status, (await bad.text()).slice(0, 80))

  const session = await req('/api/auth/session', { headers: { 'x-company-id': COMPANY } })
  console.log('GET /api/auth/session ->', session.status, (await session.text()).slice(0, 120))

  const screens = await req('/api/dashboard/screens', { headers: { 'x-company-id': COMPANY } })
  const screensBody = await screens.json()
  console.log(
    'GET /api/dashboard/screens ->',
    screens.status,
    'screens:',
    Array.isArray(screensBody.screens) ? screensBody.screens.length : 'invalid',
  )

  const subscription = await req('/api/dashboard/subscription', {
    headers: { 'x-company-id': COMPANY },
  })
  console.log('GET /api/dashboard/subscription ->', subscription.status)

  const pairingStart = await req('/api/player/pairing/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceNonce: 'n'.repeat(48) }),
  })
  console.log('POST /api/player/pairing/start ->', pairingStart.status, (await pairingStart.text()).slice(0, 200))
}

main().catch((err) => {
  console.error('smoke failed:', err)
  process.exit(1)
})
