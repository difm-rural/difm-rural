// Run with: npm test   (whole suite), or on its own:
//   node --import ./tests/support/ts-resolve.mjs shared/notificationGroups.test.ts
import assert from 'node:assert/strict'
import { relativeTime, groupByDay, dayGroupLabel } from './notificationGroups.ts'
import { notificationIconKey } from './notificationIcons.ts'

// 24 Nov 2026, 10:00 NZDT (UTC+13) = 23 Nov 21:00 UTC.
const now = new Date('2026-11-23T21:00:00Z')
const ago = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString()

assert.equal(relativeTime(ago(0), now), 'Just now')
assert.equal(relativeTime(ago(5), now), '5m ago')
assert.equal(relativeTime(ago(120), now), '2h ago')
// 9h59m ago is still 24 Nov in NZ (00:01) even though it's 23 Nov in UTC.
assert.equal(relativeTime(ago(599), now), '9h ago')
// 10h01m ago is 23 Nov 23:59 NZ → yesterday, despite being under 24h.
assert.equal(relativeTime(ago(601), now), 'Yesterday')
assert.equal(relativeTime(ago(3 * 1440), now), '3d ago')
assert.equal(relativeTime(ago(6 * 1440), now), '6d ago')
assert.equal(relativeTime('2026-11-10T01:00:00Z', now), '10 Nov 2026')
assert.equal(relativeTime('not a date', now), '')
assert.equal(relativeTime(null, now), '')

assert.equal(dayGroupLabel(ago(30), now), 'Today')
assert.equal(dayGroupLabel(ago(601), now), 'Yesterday')
assert.equal(dayGroupLabel(ago(3 * 1440), now), 'This week')
assert.equal(dayGroupLabel(ago(8 * 1440), now), 'Earlier')
assert.equal(dayGroupLabel(undefined, now), 'Earlier')

const list = [
  { id: 'a', created_at: ago(10) },
  { id: 'b', created_at: ago(200) },
  { id: 'c', created_at: ago(700) },
  { id: 'd', created_at: ago(4 * 1440) },
  { id: 'e', created_at: ago(30 * 1440) },
  { id: 'f', created_at: ago(40 * 1440) },
]
assert.deepEqual(groupByDay(list, now).map(g => [g.label, g.items.map(i => i.id)]), [
  ['Today', ['a', 'b']],
  ['Yesterday', ['c']],
  ['This week', ['d']],
  ['Earlier', ['e', 'f']],
])
assert.deepEqual(groupByDay([], now), [])
assert.deepEqual(groupByDay([{ id: 'x', created_at: ago(8 * 1440) }], now).map(g => g.label), ['Earlier'])

assert.equal(notificationIconKey('new_message'), 'chat')
assert.equal(notificationIconKey('availability_check'), 'calendar')
assert.equal(notificationIconKey('something_new'), 'bell')
assert.equal(notificationIconKey(undefined), 'bell')

console.log('notificationGroups: all assertions passed')
