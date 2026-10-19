import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const source = await readFile(new URL('../src/lib/liveNotifications.js', import.meta.url), 'utf8')
const { watchNotifications } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('new requester notifications refresh immediately; fallback detects changes and cleans up', async () => {
  let receive, poll, foreground, filter
  let rows = []
  let changes = 0
  let cleaned = 0
  const query = { select() { return query }, eq(key, value) { assert.equal(value, 'paul'); return query },
    order() { return query }, async limit() { return { data: rows, error: null } } }
  const channel = { on(event, options, callback) { filter = options.filter; receive = callback; return channel }, subscribe() { return channel } }
  const client = { from: () => query, channel: () => channel, removeChannel() { cleaned++ } }
  const state = { currentState: 'active', addEventListener(event, callback) { foreground = callback; return { remove() { cleaned++ } } } }
  const timers = { setInterval(callback) { poll = callback; return 1 }, clearInterval() { cleaned++ } }
  const stop = watchNotifications(client, 'paul', () => changes++, state, timers)
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
  await settle()
  assert.equal(filter, 'user_id=eq.paul')
  assert.equal(changes, 1)
  receive()
  assert.equal(changes, 2, 'live inserts refresh the active screens')
  poll(); await settle()
  assert.equal(changes, 2, 'unchanged polling does not reload screens')
  rows = [{ id: 'message-notification', read: false }]
  poll(); await settle()
  assert.equal(changes, 3)
  state.currentState = 'background'
  receive()
  assert.equal(changes, 3)
  state.currentState = 'active'
  rows = [{ id: 'message-notification', read: true }]
  foreground('active'); await settle()
  assert.equal(changes, 4)
  stop()
  receive()
  assert.equal(changes, 4)
  assert.equal(cleaned, 3)
})
