import assert from 'node:assert/strict'
import test from 'node:test'
import { toLocalIsoDate } from '../shared/dates.ts'
import { defaultStartForDate, quickPickDays } from '../src/lib/quickPickDates.js'

test('arrival chips hide Today once the buffered default crosses midnight', () => {
  const beforeCutoff = new Date(2026, 10, 11, 23, 14)
  const afterCutoff = new Date(2026, 10, 11, 23, 15)
  assert.equal(quickPickDays({ now: beforeCutoff, arrival: true })[0].label, 'Today')
  assert.deepEqual(
    quickPickDays({ now: afterCutoff, arrival: true }).map(({ label }) => label),
    ['Tomorrow', 'Fri 13', 'Sat 14', 'Sun 15', 'Mon 16'],
  )
  assert.equal(quickPickDays({ now: afterCutoff })[0].label, 'Today')
})

test('a future offer date selects its matching chip and keeps the 9 am default', () => {
  const now = new Date(2026, 10, 11, 10)
  const selected = defaultStartForDate('2026-11-13', now)
  assert.equal(toLocalIsoDate(selected), '2026-11-13')
  assert.equal(selected.getHours(), 9)
  assert.equal(selected.getMinutes(), 0)
  const chip = quickPickDays({ now, arrival: true })
    .find(({ date }) => toLocalIsoDate(date) === toLocalIsoDate(selected))
  assert.equal(chip?.label, 'Fri 13')
})

test('date chips respect a tomorrow minimum', () => {
  const now = new Date(2026, 10, 11, 10)
  const minimumDate = new Date(2026, 10, 12, 10)
  assert.equal(quickPickDays({ now, minimumDate })[0].label, 'Tomorrow')
})

import { quickPickTimes, selectedQuickPickHour, startForDay } from '../src/lib/quickPickDates.js'
const labels = times => times.map(({ label }) => label)
const ALL_TIMES = ['7 am', '8 am', '9 am', '10 am', '11 am', '12 pm', '1 pm', '2 pm', '3 pm', '4 pm']

test('time chips run 7 am to 4 pm on any day after today', () => {
  const now = new Date(2026, 10, 11, 15, 40)
  assert.deepEqual(labels(quickPickTimes({ day: '2026-11-12', now })), ALL_TIMES)
  assert.deepEqual(labels(quickPickTimes({ day: new Date(2026, 10, 20, 18), now })), ALL_TIMES)
  const nine = quickPickTimes({ day: '2026-11-12', now }).find(({ hour }) => hour === 9).date
  assert.equal(toLocalIsoDate(nine), '2026-11-12')
  assert.equal(nine.getHours(), 9)
  assert.equal(nine.getMinutes(), 0)
})

test('past times are hidden today', () => {
  assert.deepEqual(labels(quickPickTimes({ day: '2026-11-11', now: new Date(2026, 10, 11, 6, 30) })), ALL_TIMES)
  assert.deepEqual(labels(quickPickTimes({ day: '2026-11-11', now: new Date(2026, 10, 11, 10, 5) })),
    ['11 am', '12 pm', '1 pm', '2 pm', '3 pm', '4 pm'])
  // Exactly on the hour: that hour is no longer ahead of now.
  assert.deepEqual(labels(quickPickTimes({ day: '2026-11-11', now: new Date(2026, 10, 11, 13, 0) })), ['2 pm', '3 pm', '4 pm'])
  assert.deepEqual(labels(quickPickTimes({ day: '2026-11-11', now: new Date(2026, 10, 11, 15, 59) })), ['4 pm'])
  assert.deepEqual(quickPickTimes({ day: '2026-11-11', now: new Date(2026, 10, 11, 16, 0) }), [])
  // No day given means today.
  assert.deepEqual(labels(quickPickTimes({ now: new Date(2026, 10, 11, 14, 30) })), ['3 pm', '4 pm'])
  // A day that has already gone has no times at all.
  assert.deepEqual(quickPickTimes({ day: '2026-11-10', now: new Date(2026, 10, 11, 8) }), [])
})

test('the default time is 9 am on a future day and the next half hour today', () => {
  const now = new Date(2026, 10, 11, 10, 5)
  const future = defaultStartForDate('2026-11-13', now)
  assert.equal(selectedQuickPickHour(future, now), 9)
  const today = defaultStartForDate('2026-11-11', now)
  assert.equal(today.getHours(), 10)
  assert.equal(today.getMinutes(), 30)
  // Not on the hour, so it shows as the "Other time" value rather than a chip.
  assert.equal(selectedQuickPickHour(today, now), null)
  // Today on the hour does match its chip.
  assert.equal(selectedQuickPickHour(new Date(2026, 10, 11, 14, 0), now), 14)
  // Outside 7 am – 4 pm is always "Other time".
  assert.equal(selectedQuickPickHour(new Date(2026, 10, 13, 18, 0), now), null)
})

test('changing day keeps an explicitly chosen time unless it has passed', () => {
  const now = new Date(2026, 10, 11, 10, 5)
  const twoPm = new Date(2026, 10, 13, 14, 0)
  const moved = startForDay('2026-11-14', { keepTimeFrom: twoPm, now })
  assert.equal(toLocalIsoDate(moved), '2026-11-14')
  assert.equal(moved.getHours(), 14)
  // Moving an 8 am choice to today (already 10:05) falls back to today's default.
  const toToday = startForDay('2026-11-11', { keepTimeFrom: new Date(2026, 10, 13, 8, 0), now })
  assert.equal(toToday.getHours(), 10)
  assert.equal(toToday.getMinutes(), 30)
  // No chosen time: the day's default.
  assert.equal(startForDay('2026-11-14', { now }).getHours(), 9)
})
