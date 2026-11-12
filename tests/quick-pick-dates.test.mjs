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
