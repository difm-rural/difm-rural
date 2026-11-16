import assert from 'node:assert/strict'
import test from 'node:test'
import { liveChannel, retryDelay, showThreadLive, isLiveThreadRow } from '../provider-web/src/lib/realtime.ts'

// A fake realtime client: records channels, lets the test drive each channel's
// subscribe status, and counts removals.
function fakeClient() {
  const channels = [], removed = []
  return {
    channels, removed,
    channel(name) {
      const ch = { name, bindings: 0, status: null, on() { ch.bindings++; return ch }, subscribe(cb) { ch.status = cb; return ch } }
      channels.push(ch); return ch
    },
    removeChannel(ch) { removed.push(ch) },
  }
}
function timers() {
  const queue = []
  return {
    queue,
    setTimer(fn, ms) { const t = { fn, ms, done: false }; queue.push(t); return t },
    clearTimer(t) { if (t) t.done = true },
    async runNext() { const t = queue.find(x => !x.done); if (!t) return null; t.done = true; await t.fn(); await new Promise(r => setImmediate(r)); return t.ms },
  }
}

test('a channel that is closed, errors or times out rejoins with backoff, refreshing auth first', async () => {
  const client = fakeClient(), clock = timers()
  let authRefreshes = 0
  const stop = liveChannel(client, 'web-alerts-u', ch => ch.on(), { ...clock, refreshAuth: async () => { authRefreshes++ }, watchVisibility: false, uniqueId: () => 'x' })
  assert.equal(client.channels.length, 1)
  client.channels[0].status('SUBSCRIBED')
  assert.equal(clock.queue.length, 0, 'no retry while subscribed')

  client.channels[0].status('CLOSED') // e.g. the server closed it on an expired token
  assert.deepEqual(client.removed, [client.channels[0]], 'the dead channel is removed')
  assert.equal(await clock.runNext(), retryDelay(0))
  assert.equal(authRefreshes, 1, 'auth refreshed before rejoining')
  assert.equal(client.channels.length, 2, 'a new channel joined')
  assert.equal(client.channels[1].bindings, 1, 'with the same bindings')

  client.channels[1].status('CHANNEL_ERROR')
  assert.equal(await clock.runNext(), retryDelay(1), 'backs off')
  client.channels[2].status('TIMED_OUT')
  assert.equal(await clock.runNext(), retryDelay(2))
  client.channels[3].status('SUBSCRIBED')
  client.channels[3].status('CLOSED')
  assert.equal(await clock.runNext(), retryDelay(0), 'a successful join resets the backoff')

  stop()
  assert.ok(client.removed.includes(client.channels[4]), 'cleanup removes the live channel')
  client.channels[4].status('CLOSED')
  assert.equal(await clock.runNext(), null, 'no rejoin after cleanup')
})

test('late status callbacks from a replaced channel are ignored', async () => {
  const client = fakeClient(), clock = timers()
  liveChannel(client, 'thread', ch => ch, { ...clock, watchVisibility: false, uniqueId: () => 'x' })
  const first = client.channels[0]
  first.status('CLOSED')
  first.status('CLOSED') // removal echoes another CLOSED
  assert.equal(clock.queue.filter(t => !t.done).length, 1, 'only one rejoin scheduled')
  await clock.runNext()
  first.status('CHANNEL_ERROR')
  assert.equal(clock.queue.filter(t => !t.done).length, 0, 'the old channel cannot schedule more')
})

test('backoff is capped at 30 seconds', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 10].map(retryDelay), [1000, 2000, 4000, 8000, 16000, 30000, 30000])
})

test('rows for a conversation shown live skip the page refresh; others do not', () => {
  const stopJob = showThreadLive({ kind: 'job', id: 'job-1' })
  const stopBooking = showThreadLive({ kind: 'booking', id: 'booking-1' })
  assert.equal(isLiveThreadRow('messages', { job_id: 'job-1' }), true)
  assert.equal(isLiveThreadRow('messages', { job_id: 'job-2' }), false)
  assert.equal(isLiveThreadRow('service_booking_messages', { booking_id: 'booking-1' }), true)
  assert.equal(isLiveThreadRow('notifications', { type: 'new_message', metadata: { job_id: 'job-1', sender_id: 'p' } }), true)
  // A booking message notification also carries service_id: the booking decides.
  assert.equal(isLiveThreadRow('notifications', { type: 'new_message', metadata: { booking_id: 'booking-1', service_id: 'svc' } }), true)
  assert.equal(isLiveThreadRow('notifications', { type: 'new_bid', metadata: { job_id: 'job-1' } }), false, 'other notifications still refresh the page')
  assert.equal(isLiveThreadRow('messages', { service_id: 'svc-1' }), false)
  stopJob()
  assert.equal(isLiveThreadRow('messages', { job_id: 'job-1' }), false, 'no longer live once the conversation closes')
  // Counted: two views of one thread stay live until both close.
  const a = showThreadLive({ kind: 'listing', id: 'svc-1' }), b = showThreadLive({ kind: 'listing', id: 'svc-1' })
  a(); assert.equal(isLiveThreadRow('messages', { service_id: 'svc-1' }), true)
  b(); assert.equal(isLiveThreadRow('messages', { service_id: 'svc-1' }), false)
  stopBooking()
  assert.equal(isLiveThreadRow('messages', null), false)
})
