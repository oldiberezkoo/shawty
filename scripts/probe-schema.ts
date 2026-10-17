import { deviceFrameSchema } from '../src/server/ws/protocol'

const frame = {
  type: 'watch-pairing',
  sessionId: 'Q9R4RSBYWD8TACV9F39BQ5YNBSQ',
  deviceNonce: 'n'.repeat(43),
}

const result = deviceFrameSchema.safeParse(frame)

console.log('watch-pairing валиден:', result.success)
if (!result.success) {
  console.log('ошибки:', JSON.stringify(result.error.issues, null, 2))
}

const heartbeat = deviceFrameSchema.safeParse({
  type: 'heartbeat',
  playerVersion: '0.1.0',
})
console.log('heartbeat валиден:', heartbeat.success)
if (!heartbeat.success) {
  console.log('ошибки:', JSON.stringify(heartbeat.error.issues, null, 2))
}

const hello = deviceFrameSchema.safeParse({ type: 'hello', accessToken: 'x'.repeat(40) })
console.log('hello валиден:', hello.success)
if (!hello.success) {
  console.log('ошибки:', JSON.stringify(hello.error.issues, null, 2))
}
