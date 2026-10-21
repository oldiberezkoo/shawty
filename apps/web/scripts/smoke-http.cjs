/**
 * Сквозная проверка входа и страниц дашборда.
 * Использование: node scripts/smoke-http.cjs
 */
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'

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

  const health = await req('/login')
  console.log('GET /login ->', health.status)

  const login = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@shawty.uz', password: 'demo1234' }),
  })
  const loginBody = await login.text()
  console.log('POST /api/auth/login ->', login.status, loginBody.slice(0, 120))
  console.log('cookies received:', cookies ? cookies.split(';').length : 0)

  const bad = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@shawty.uz', password: 'wrong' }),
  })
  console.log('POST /api/auth/login (wrong password) ->', bad.status, (await bad.text()).slice(0, 80))

  const dash = await req('/dashboard')
  const dashBody = await dash.text()
  console.log('GET /dashboard ->', dash.status, 'has title:', dashBody.includes('Обзор сети'))

  const screens = await req('/dashboard/screens')
  const screensBody = await screens.text()
  console.log('GET /dashboard/screens ->', screens.status, 'has Demo Retail:', screensBody.includes('Demo Retail'))

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
