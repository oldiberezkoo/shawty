const { WebSocket } = require('ws')
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'
const NONCE = 'n'.repeat(43)

async function main() {
  const start = await fetch(`${BASE}/api/player/pairing/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceNonce: NONCE }),
  })
  const session = await start.json()
  console.log('session:', session.sessionId, 'code:', session.code)

  const socket = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws/device')

  socket.on('upgrade', (res) => console.log('upgrade:', res.statusCode))
  socket.on('open', () => {
    console.log('open')
    const payload = JSON.stringify({ type: 'watch-pairing', sessionId: session.sessionId, deviceNonce: NONCE })
    console.log('send:', payload)
    socket.send(payload, (err) => console.log('send cb:', err ? err.message : 'ok'))
  })
  socket.on('message', (raw) => console.log('message:', String(raw)))
  socket.on('ping', () => console.log('ping'))
  socket.on('pong', () => console.log('pong'))
  socket.on('close', (code, reason) => console.log('close:', code, String(reason)))
  socket.on('error', (err) => console.log('error:', err.message))

  await new Promise((r) => setTimeout(r, 4000))
  console.log('final readyState:', socket.readyState)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
