// Run with: npm test   (whole suite), or on its own:
//   node --import ./tests/support/ts-resolve.mjs shared/requestedDate.test.ts
import assert from 'node:assert/strict'
import {
  arrivalDayChoices, arrivalDayMatch, arrivalDayNote, offerDefaultDay, rangeLabel, requestedLabel,
} from './requestedDate.ts'

let passed = 0
function check(name: string, got: unknown, expected: unknown) {
  assert.deepEqual(got, expected, `${name}\n  got:      ${JSON.stringify(got)}\n  expected: ${JSON.stringify(expected)}`)
  passed++
}

const today = '2026-11-12' // a Thursday
const specific = { schedule_type: 'specific', scheduled_date: '2026-11-15' }
const range = { schedule_type: 'range', date_from: '2026-11-15', date_to: '2026-11-18' }
const flexible = { schedule_type: 'flexible' }
const asap = { schedule_type: 'asap' }
const passedSpecific = { schedule_type: 'specific', scheduled_date: '2026-11-08' }
const days = (job: object, opts = {}) => arrivalDayChoices(job, { today, ...opts })

// ---- "Requested: …" label ----
check('label · specific', requestedLabel(specific, today), 'Sun 15 Nov')
check('label · range', requestedLabel(range, today), '15–18 Nov')
check('label · range across months', rangeLabel('2026-11-28', '2026-12-02'), '28 Nov – 2 Dec')
check('label · flexible', requestedLabel(flexible, today), 'Flexible')
check('label · asap', requestedLabel(asap, today), 'As soon as possible')
check('label · no schedule at all', requestedLabel({}, today), 'Flexible')
check('label · passed specific', requestedLabel(passedSpecific, today), 'Sun 8 Nov (passed)')
check('label · passed range', requestedLabel({ schedule_type: 'range', date_from: '2026-11-01', date_to: '2026-11-05' }, today), '1–5 Nov (passed)')
check('label · legacy row with a date but no type', requestedLabel({ scheduled_date: '2026-11-15' }, today), 'Sun 15 Nov')
check('label · datetime value reads as its NZ day', requestedLabel({ schedule_type: 'specific', scheduled_date: '2026-11-14T11:30:00Z' }, today), 'Sun 15 Nov')

// ---- Chip selection ----
check('chips · specific → "Use requested date", pre-selected, quick picks follow', days(specific), {
  requestedLabel: 'Sun 15 Nov',
  chips: [{ day: '2026-11-15', label: 'Use requested date · Sun 15', kind: 'requested' }],
  preselect: '2026-11-15',
  quickPicks: true,
})

check('chips · specific requested for today still counts', days({ schedule_type: 'specific', scheduled_date: today }).preselect, today)

check('chips · range → its days, first pre-selected, no quick picks', days(range), {
  requestedLabel: '15–18 Nov',
  chips: [
    { day: '2026-11-15', label: 'Sun 15', kind: 'range' },
    { day: '2026-11-16', label: 'Mon 16', kind: 'range' },
    { day: '2026-11-17', label: 'Tue 17', kind: 'range' },
    { day: '2026-11-18', label: 'Wed 18', kind: 'range' },
  ],
  preselect: '2026-11-15',
  quickPicks: false,
})

check('chips · range already under way starts from today',
  days({ schedule_type: 'range', date_from: '2026-11-10', date_to: '2026-11-13' }).chips.map(c => c.day),
  ['2026-11-12', '2026-11-13'])

const longRange = days({ schedule_type: 'range', date_from: '2026-11-15', date_to: '2026-12-15' })
check('chips · long range is capped at 7 days', longRange.chips.length, 7)
check('chips · long range last chip', longRange.chips[6].day, '2026-11-21')

for (const [name, job] of [['flexible', flexible], ['asap', asap], ['no schedule', {}]] as const) {
  check(`chips · ${name} → only the usual quick picks`, days(job, { offerDay: '2026-11-20' }),
    { requestedLabel: requestedLabel(job, today), chips: [], preselect: null, quickPicks: true })
}

check('chips · passed specific → shown as passed, not offered or pre-selected', days(passedSpecific), {
  requestedLabel: 'Sun 8 Nov (passed)', chips: [], preselect: null, quickPicks: true,
})

check('chips · passed range → not pre-selected',
  days({ schedule_type: 'range', date_from: '2026-11-01', date_to: '2026-11-05' }),
  { requestedLabel: '1–5 Nov (passed)', chips: [], preselect: null, quickPicks: true })

check('chips · offer later than the requested date → extra chip, not pre-selected',
  days(specific, { offerDay: '2026-11-17' }), {
    requestedLabel: 'Sun 15 Nov',
    chips: [
      { day: '2026-11-15', label: 'Use requested date · Sun 15', kind: 'requested' },
      { day: '2026-11-17', label: 'You offered · Tue 17', kind: 'offer' },
    ],
    preselect: '2026-11-15',
    quickPicks: true,
  })

check('chips · offer on or before the requested date → no extra chip',
  days(specific, { offerDay: '2026-11-15' }).chips.map(c => c.kind), ['requested'])
check('chips · offer inside the range → no extra chip',
  days(range, { offerDay: '2026-11-17' }).chips.filter(c => c.kind === 'offer'), [])
check('chips · offer after the range → extra chip',
  days(range, { offerDay: '2026-11-20' }).chips.at(-1), { day: '2026-11-20', label: 'You offered · Fri 20', kind: 'offer' })
check('chips · offer later than a passed date → offered, still not pre-selected',
  days(passedSpecific, { offerDay: '2026-11-17' }),
  { requestedLabel: 'Sun 8 Nov (passed)', chips: [{ day: '2026-11-17', label: 'You offered · Tue 17', kind: 'offer' }], preselect: null, quickPicks: true })
check('chips · an offer date that has itself passed is dropped',
  days(passedSpecific, { offerDay: '2026-11-10' }).chips, [])

// ---- Message wording: match vs mismatch ----
check('message · specific match', arrivalDayNote(specific, '2026-11-15'), { suffix: ' (the day you asked for)', line: '' })
check('message · specific mismatch', arrivalDayNote(specific, '2026-11-16'),
  { suffix: '', line: "Note: that's Mon 16 Nov, not the Sun 15 Nov you asked for." })
check('message · range match (first day)', arrivalDayNote(range, '2026-11-15'), { suffix: ' (the day you asked for)', line: '' })
check('message · range match (last day)', arrivalDayNote(range, '2026-11-18'), { suffix: ' (the day you asked for)', line: '' })
check('message · range mismatch', arrivalDayNote(range, '2026-11-21'),
  { suffix: '', line: "Note: that's Sat 21 Nov, not the 15–18 Nov you asked for." })
check('message · passed date is still a mismatch', arrivalDayNote(passedSpecific, '2026-11-13'),
  { suffix: '', line: "Note: that's Fri 13 Nov, not the Sun 8 Nov you asked for." })
check('message · flexible → nothing extra', arrivalDayNote(flexible, '2026-11-15'), { suffix: '', line: '' })
check('message · asap → nothing extra', arrivalDayNote(asap, '2026-11-15'), { suffix: '', line: '' })
check('match helper', [arrivalDayMatch(specific, '2026-11-15'), arrivalDayMatch(specific, '2026-11-14'), arrivalDayMatch(flexible, '2026-11-15'), arrivalDayMatch(specific, null)],
  ['match', 'mismatch', 'none', 'none'])

// ---- Offer form default ----
check('offer default · specific in the future', offerDefaultDay(specific, today), '2026-11-15')
check('offer default · range → its first day', offerDefaultDay(range, today), '2026-11-15')
check('offer default · requested today', offerDefaultDay({ schedule_type: 'specific', scheduled_date: today }, today), today)
check('offer default · passed → none', offerDefaultDay(passedSpecific, today), null)
check('offer default · range already started → none', offerDefaultDay({ schedule_type: 'range', date_from: '2026-11-10', date_to: '2026-11-20' }, today), null)
check('offer default · flexible → none', offerDefaultDay(flexible, today), null)

console.log(`\n✅ requestedDate: all ${passed} cases passed`)
