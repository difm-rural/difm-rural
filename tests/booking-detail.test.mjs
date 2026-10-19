import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const source = await readFile(new URL('../src/lib/bookingDetail.js', import.meta.url), 'utf8')
const { fetchBookingDetail } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('booking participants load from public profiles without private profile embeds', async () => {
  const calls = []
  const client = { from(table) {
    calls.push(table)
    const query = {
      select(columns) { calls.push(columns); return query },
      eq(key, id) { assert.equal(id, 'water-booking'); return query },
      async single() { return { data: { id: 'water-booking', requester_id: 'paul', provider_id: 'peter', status: 'pending' }, error: null } },
      async in(key, ids) {
        assert.deepEqual(ids, ['paul', 'peter'])
        return { data: [{ id: 'paul', full_name: 'Paul' }, { id: 'peter', full_name: 'Peter Provider' }], error: null }
      },
    }; return query
  } }
  const booking = await fetchBookingDetail(client, 'water-booking')
  assert.equal(booking.requester.full_name, 'Paul')
  assert.equal(booking.provider.full_name, 'Peter Provider')
  assert.equal(booking.status, 'pending')
  assert.ok(calls.includes('profiles_public'))
  assert.ok(!calls.some(value => value.includes('requester:requester_id') || value === 'profiles'))
})

test('failed booking fetch rejects rather than rendering a fabricated person', async () => {
  const query = { select() { return query }, eq() { return query }, async single() { return { data: null, error: new Error('Offline') } } }
  await assert.rejects(fetchBookingDetail({ from() { return query } }, 'booking'), /Offline/)
})
