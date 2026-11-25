import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAvailabilityDiscovery, AVAILABILITY_FILTERS, availabilityFilterValue, leadTimeDays, leadTimeRank,
  listingDiscovery, listingEnquiryOnly, matchesAvailabilityFilter, sortByLeadTime,
} from './availabilityDiscovery'
import {LEAD_TIME_OPTIONS, LISTING_AVAILABILITY_STATUSES, listingAvailability, type ListingAvailability} from './listingAvailability'
import {nzToday} from './postingDates'

const today = '2026-11-26'
const on = (patch: ListingAvailability & {id?: string; kind?: string | null} = {}) => ({
  kind: 'service', availability_enabled: true, availability_updated_at: '2026-11-20T00:00:00Z',
  availability_status: 'accepting_bookings' as const, lead_time_type: 'not_specified' as const, ...patch,
})
const ids = (rows: {id?: string}[]) => rows.map(row => row.id)

test('filter values are validated and default to all listings', () => {
  assert.deepEqual(AVAILABILITY_FILTERS.map(([value]) => value), ['', 'accepting', 'lead_time'])
  assert.equal(AVAILABILITY_FILTERS[0][1], 'All listings')
  for (const bad of [undefined, null, 'paused', 'ACCEPTING', 1, {}]) assert.equal(availabilityFilterValue(bad), '')
  assert.equal(availabilityFilterValue('accepting'), 'accepting')
  assert.equal(availabilityFilterValue('lead_time'), 'lead_time')
})

test('every lead-time type normalises to comparable days or unknown', () => {
  const expected: Record<keyof typeof LEAD_TIME_OPTIONS, number | null> = {
    not_specified: null, same_day: 0, next_day: 1, fixed_days: 3, range_days: 7, earliest_date: 4, contact_provider: null,
  }
  for (const type of Object.keys(LEAD_TIME_OPTIONS) as (keyof typeof LEAD_TIME_OPTIONS)[]) {
    const listing = on({lead_time_type: type, lead_time_min_days: type === 'range_days' ? 2 : 3,
      lead_time_max_days: type === 'range_days' ? 7 : null, lead_time_date: '2026-11-30'})
    assert.equal(leadTimeDays(listing, today), expected[type], type)
  }
  assert.equal(leadTimeDays(on({lead_time_type: 'fixed_days', lead_time_min_days: 1}), today), 1)
  assert.equal(leadTimeDays(on({lead_time_type: 'fixed_days', lead_time_min_days: null}), today), null)
  assert.equal(leadTimeDays(on({lead_time_type: 'range_days', lead_time_min_days: 5, lead_time_max_days: 10}), today), 10, 'ranges use the upper bound')
  assert.equal(leadTimeDays(on({lead_time_type: undefined}), today), null)
  assert.equal(leadTimeDays(on({lead_time_type: 'weekly' as never}), today), null, 'unrecognised types from newer clients are unknown')
})

test('every availability status is grouped correctly', () => {
  const groups: Record<keyof typeof LISTING_AVAILABILITY_STATUSES, string> = {accepting_bookings: 'accepting', limited: 'accepting', paused: 'paused'}
  for (const status of Object.keys(LISTING_AVAILABILITY_STATUSES) as (keyof typeof LISTING_AVAILABILITY_STATUSES)[]) {
    const listing = on({availability_status: status, lead_time_type: 'same_day'})
    assert.equal(listingDiscovery(listing, today).group, groups[status], status)
    assert.equal(matchesAvailabilityFilter(listing, 'accepting', today), status !== 'paused')
    assert.equal(matchesAvailabilityFilter(listing, 'lead_time', today), status !== 'paused')
    assert.equal(matchesAvailabilityFilter(listing, '', today), true)
  }
})

test('earliest available dates count calendar days from today in New Zealand, past dates rank as 0', () => {
  const date = (lead_time_date: string) => on({lead_time_type: 'earliest_date', lead_time_date})
  assert.equal(leadTimeDays(date('2026-11-26'), today), 0)
  assert.equal(leadTimeDays(date('2026-11-27'), today), 1)
  assert.equal(leadTimeDays(date('2026-12-26'), today), 30)
  assert.equal(leadTimeDays(date('2026-11-01'), today), 0)
  assert.equal(leadTimeDays(date('2027-01-01'), '2026-12-31'), 1, 'year boundary')
  assert.equal(leadTimeDays(date('2026-09-28'), '2026-09-26'), 2, 'across the NZ daylight-saving change')
  assert.equal(leadTimeDays(date('not-a-date'), today), null)
  assert.equal(leadTimeDays(on({lead_time_type: 'earliest_date', lead_time_date: null}), today), null)
  // 10:59 UTC is 23:59 NZDT on the 26th; one minute later it is the 27th in New Zealand (still the 26th in UTC).
  const before = nzToday(new Date('2026-11-26T10:59:00Z')), after = nzToday(new Date('2026-11-26T11:00:00Z'))
  assert.equal(before, '2026-11-26'); assert.equal(after, '2026-11-27')
  assert.equal(leadTimeDays(date('2026-11-27'), before), 1)
  assert.equal(leadTimeDays(date('2026-11-27'), after), 0)
  // Winter (NZST, UTC+12)
  assert.equal(nzToday(new Date('2026-06-30T11:59:00Z')), '2026-06-30')
  assert.equal(nzToday(new Date('2026-06-30T12:00:00Z')), '2026-07-01')
})

test('past earliest dates rank as 0 for sorting without changing the displayed date', () => {
  const past = on({id: 'past', lead_time_type: 'earliest_date', lead_time_date: '2026-11-01'})
  const before = listingAvailability(past).lead
  assert.equal(sortByLeadTime([on({id: 'next', lead_time_type: 'next_day'}), past], today)[0].id, 'past')
  assert.equal(listingAvailability(past).lead, before)
  assert.match(before, /^Estimated lead time: From /)
})

test('availability management disabled counts as accepting bookings with an unknown lead time', () => {
  const disabled = {id: 'off', kind: 'service', availability_enabled: false, availability_status: 'paused' as const, lead_time_type: 'same_day' as const}
  assert.deepEqual(listingDiscovery(disabled, today), {group: 'accepting', days: null, enabled: false})
  assert.equal(matchesAvailabilityFilter(disabled, 'accepting', today), true)
  assert.equal(matchesAvailabilityFilter(disabled, 'lead_time', today), false)
  // Legacy rows created before Release 1.2 have no availability columns at all.
  const legacy = {id: 'legacy', kind: 'service', availability: ['2099-01-01']}
  assert.equal(matchesAvailabilityFilter(legacy, 'accepting', today), true)
  assert.equal(matchesAvailabilityFilter(legacy, 'lead_time', today), false)
  assert.equal(leadTimeDays(legacy, today), null, 'legacy available-from dates are not treated as published estimates')
})

test('limited availability with an estimate counts as accepting and published lead time', () => {
  const limited = on({availability_status: 'limited', lead_time_type: 'fixed_days', lead_time_min_days: 5})
  assert.deepEqual(listingDiscovery(limited, today), {group: 'accepting', days: 5, enabled: true})
  assert.equal(matchesAvailabilityFilter(limited, 'lead_time', today), true)
})

test('temporarily paused listings are excluded from both availability filters', () => {
  const paused = on({availability_status: 'paused', lead_time_type: 'same_day'})
  assert.equal(matchesAvailabilityFilter(paused, 'accepting', today), false)
  assert.equal(matchesAvailabilityFilter(paused, 'lead_time', today), false)
  assert.deepEqual(leadTimeRank(paused, today), [2, 0], 'a paused estimate never earns a lead-time rank')
})

test('enquiry-only listings never count as accepting bookings or get a lead-time rank', () => {
  for (const kind of ['for_sale', 'lease']) {
    const enquiry = on({kind, lead_time_type: 'same_day'})
    assert.equal(listingEnquiryOnly(enquiry), true)
    assert.equal(matchesAvailabilityFilter(enquiry, 'accepting', today), false)
    assert.equal(matchesAvailabilityFilter(enquiry, 'lead_time', today), false)
    assert.deepEqual(leadTimeRank(enquiry, today), [3, 0])
    assert.equal(listingDiscovery(enquiry, today).days, null)
  }
  for (const kind of ['service', 'grazing', 'hire', null, undefined]) assert.equal(listingEnquiryOnly({kind}), false, String(kind))
})

test('contact provider, not specified and unknown estimates are accepting but not published lead times', () => {
  for (const lead_time_type of ['contact_provider', 'not_specified'] as const) {
    const listing = on({lead_time_type})
    assert.equal(matchesAvailabilityFilter(listing, 'accepting', today), true)
    assert.equal(matchesAvailabilityFilter(listing, 'lead_time', today), false)
    assert.deepEqual(leadTimeRank(listing, today), [1, 0])
  }
})

test('shortest lead time orders comparable estimates, then unknown, then paused, then enquiry-only', () => {
  const rows = [
    on({id: 'sale', kind: 'for_sale', lead_time_type: 'same_day'}),
    on({id: 'paused', availability_status: 'paused', lead_time_type: 'same_day'}),
    on({id: 'contact', lead_time_type: 'contact_provider'}),
    {id: 'disabled', kind: 'service', availability_enabled: false},
    on({id: 'range', lead_time_type: 'range_days', lead_time_min_days: 1, lead_time_max_days: 6}),
    on({id: 'fixed', availability_status: 'limited', lead_time_type: 'fixed_days', lead_time_min_days: 4}),
    on({id: 'date', lead_time_type: 'earliest_date', lead_time_date: '2026-11-28'}),
    on({id: 'next', lead_time_type: 'next_day'}),
    on({id: 'same', lead_time_type: 'same_day'}),
  ]
  assert.deepEqual(ids(sortByLeadTime(rows, today)), ['same', 'next', 'date', 'fixed', 'range', 'contact', 'disabled', 'paused', 'sale'])
  assert.deepEqual(ids(rows)[0], 'sale', 'sorting does not mutate the input')
})

test('equal lead times keep the existing default order (stable)', () => {
  const rows = Array.from({length: 30}, (_, i) => on({id: 'r' + i, lead_time_type: i % 3 ? 'next_day' : 'fixed_days', lead_time_min_days: 1}))
  // fixed 1 day and next day are equal (1); unknown rows also keep their order.
  assert.deepEqual(ids(sortByLeadTime(rows, today)), ids(rows))
  const mixed = [on({id: 'u1'}), on({id: 'a', lead_time_type: 'same_day'}), on({id: 'u2'}), on({id: 'b', lead_time_type: 'same_day'}), on({id: 'p1', availability_status: 'paused'}), on({id: 'u3'}), on({id: 'p2', availability_status: 'paused'})]
  assert.deepEqual(ids(sortByLeadTime(mixed, today)), ['a', 'b', 'u1', 'u2', 'u3', 'p1', 'p2'])
})

test('default sort and filter leave rows untouched', () => {
  const rows = [on({id: 'paused', availability_status: 'paused'}), on({id: 'sale', kind: 'for_sale'}), on({id: 'same', lead_time_type: 'same_day'})]
  assert.equal(applyAvailabilityDiscovery(rows, '', 'default', today), rows)
  assert.deepEqual(ids(applyAvailabilityDiscovery(rows, '', 'newest', today)), ['paused', 'sale', 'same'])
  assert.deepEqual(ids(applyAvailabilityDiscovery(rows, 'accepting', 'default', today)), ['same'])
  assert.deepEqual(ids(applyAvailabilityDiscovery(rows, 'lead_time', 'lead_time', today)), ['same'])
})

test('helpers read availability only and never change displayed lead-time values', () => {
  const rows = [on({id: 'r', lead_time_type: 'range_days', lead_time_min_days: 2, lead_time_max_days: 5})]
  const before = JSON.stringify(rows), display = listingAvailability(rows[0]).card
  sortByLeadTime(rows, today); applyAvailabilityDiscovery(rows, 'lead_time', 'lead_time', today)
  assert.equal(JSON.stringify(rows), before)
  assert.deepEqual(listingAvailability(rows[0]).card, display)
  assert.deepEqual(display, ['Accepting bookings', 'Estimated lead time: 2 to 5 days'])
})
