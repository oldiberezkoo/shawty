const { WebSocket } = require('ws')
const url = (process.env.SMOKE_BASE ?? 'http://localhost:3000').replace(/^http/, 'ws') + '/ws/device'

const socket = new WebSocket(url)

socket.on('open', () => {
  console.log('connected')
  socket.send(JSON.stringify({ type: 'watch-pairing', sessionId: 'S'.repeat(27), deviceNonce: 'n'.repeat(43) }))
})
socket.on('message', (raw) => console.log('frame:', String(raw)))
socket.on('close', (code, reason) => {
  console.log('closed:', code, String(reason))
  process.exit(0)
})
socket.on('error', (err) => {
  console.log('error:', err.message)
  process.exit(1)
})

setTimeout(() => {
  console.log('timeout, readyState =', socket.readyState)
  process.exit(socket.readyState === 1 ? 0 : 1)
}, 6000)
