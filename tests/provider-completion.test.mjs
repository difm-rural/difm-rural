import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const read = async path => await readFile(new URL(path, import.meta.url), 'utf8')
const moduleFromSource = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
globalThis.completionLifecycle = await moduleFromSource(await read('../src/lib/lifecycle.js'))
globalThis.completionClient = {}
const replacements = source => source
  .replace("import { bookingPricingType } from './listingEstimate'",`import { bookingPricingType } from '${new URL('../shared/listingEstimate.ts',import.meta.url).href}'`)
  .replace("import { supabase } from './supabase'", 'const supabase = globalThis.completionClient')
  .replace("import { JOB_STATUS, JOB_ACTIVE_STATUSES } from './lifecycle'", 'const { JOB_STATUS, JOB_ACTIVE_STATUSES } = globalThis.completionLifecycle')
  .replace("import { BOOKING_STATUS, isBookingWithdrawable } from './lifecycle'", 'const { BOOKING_STATUS, isBookingWithdrawable } = globalThis.completionLifecycle')
  .replace("import { saveReview } from './reviews'", 'const saveReview = () => {}')
const { markJobComplete } = await moduleFromSource(replacements(await read('../src/lib/jobActions.js')))
const { markBookingReady } = await moduleFromSource(replacements(await read('../src/lib/bookingActions.js')))
const { bookingNextMove } = await moduleFromSource((await read('../src/lib/nextMove.js'))
  .replace("import { bookingPricingType } from './listingEstimate'",`import { bookingPricingType } from '${new URL('../shared/listingEstimate.ts',import.meta.url).href}'`)
  .replace("import { supabase } from './supabase'", 'const supabase = {}')
  .replace("import { BOOKING_ACTIVE_STATUSES, JOB_ACTIVE_STATUSES } from './lifecycle'", 'const { BOOKING_ACTIVE_STATUSES, JOB_ACTIVE_STATUSES } = globalThis.completionLifecycle'))

test('accepted grazing directs both parties to ongoing arrangements rather than completion', () => {
  for (const role of ['provider', 'requester']) {
    for (const status of ['confirmed', 'in_progress']) {
      const next = bookingNextMove({ status, scheduled_date: '2026-11-01', service: { kind: 'grazing' } }, role)
      assert.match(JSON.stringify(next), /Grazing arrangement accepted/)
      assert.match(JSON.stringify(next), /Use Chat/)
      assert.match(JSON.stringify(next), /payment/)
      assert.doesNotMatch(JSON.stringify(next), /Complete the service/)
      if (role === 'provider') assert.match(JSON.stringify(next), /close the listing or relist/)
    }
  }
})

function mutationClient(result) {
  const calls = []
  const query = {
    update(value) { calls.push(['update', value]); return query },
    eq(key, value) { calls.push(['eq', key, value]); return query },
    in(key, value) { calls.push(['in', key, value]); return query },
    async select() { return result },
  }
  Object.assign(globalThis.completionClient, { from(table) { calls.push(['from', table]); return query } })
  return calls
}

test('provider job completion writes completed directly from awarded states', async () => {
  const calls = mutationClient({ data: [{ id: 'job', status: 'completed' }], error: null })
  assert.equal((await markJobComplete('job')).error, null)
  assert.deepEqual(calls, [['from', 'jobs'], ['update', { status: 'completed' }],
    ['eq', 'id', 'job'], ['in', 'status', ['accepted', 'in_progress']]])
})
test('provider booking completion writes completed directly from underway states', async () => {
  const calls = mutationClient({ data: [{ id: 'booking', status: 'completed' }], error: null })
  assert.equal((await markBookingReady('booking')).error, null)
  assert.deepEqual(calls, [['from', 'bookings'], ['update', { status: 'completed' }],
    ['eq', 'id', 'booking'], ['in', 'status', ['confirmed', 'in_progress']]])
})
test('racing completion and database rejection do not report false success', async () => {
  mutationClient({ data: [], error: null })
  assert.equal((await markJobComplete('job')).error.code, 'stale')
  mutationClient({ data: null, error: { message: 'Permission denied' } })
  assert.equal((await markBookingReady('booking')).error.message, 'Permission denied')
})
