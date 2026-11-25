import assert from 'node:assert/strict'
import test from 'node:test'
import {availabilityDraft, availabilityPatch, LEAD_TIME_OPTIONS, listingAvailability, LISTING_AVAILABILITY_STATUSES} from './listingAvailability'

const updated = '2026-11-26T12:00:00Z'
const future = '2099-11-26'

test('legacy listings have no new badge and retain their available-from date', () => {
  assert.deepEqual(listingAvailability({availability_status: 'accepting_bookings'}).card, [])
  assert.match(listingAvailability({availability: [future]}).lead, /^Available from /)
  assert.equal(availabilityDraft({availability: [future]}).type, 'earliest_date')
  assert.equal(listingAvailability({availability: [future], availability_updated_at: updated}).lead, '')
})

test('all configured statuses and estimates survive a round trip', () => {
  const draft = availabilityDraft({})
  for (const [status, label] of Object.entries(LISTING_AVAILABILITY_STATUSES)) {
    for (const lead of Object.keys(LEAD_TIME_OPTIONS)) {
      const patch = availabilityPatch({...draft,status: status as typeof draft.status,
        type: lead as typeof draft.type, min:'2', max:'4', date:future, message:'  Busy this week  '}, {})
      const data = {...patch, availability_updated_at: updated}
      const display = listingAvailability(data)
      assert.equal(display.status, label)
      assert.equal(display.paused, status === 'paused')
      assert.equal(!!display.estimate, lead !== 'not_specified')
      assert.equal(display.message, 'Busy this week')
      assert.match(display.updated, /^Updated /)
      assert.deepEqual(availabilityPatch(availabilityDraft(data), data), patch)
    }
  }
})

test('pause and reopen retain configured timing and message, including an existing historical date', () => {
  const listing = {lead_time_type: 'earliest_date' as const, lead_time_date: '2000-01-01',
    availability_updated_at: updated, availability_message: 'Call ahead'}
  const paused = availabilityPatch({...availabilityDraft(listing),status:'paused'}, listing)
  const reopened = availabilityPatch({...availabilityDraft({...listing, ...paused}),status:'accepting_bookings'}, listing)
  assert.equal(reopened.lead_time_date, listing.lead_time_date)
  assert.equal(reopened.availability_message, listing.availability_message)
})

test('rules reject invalid dates, quantities and messages, and ignore irrelevant fields', () => {
  const draft = availabilityDraft({})
  assert.throws(() => availabilityPatch({...draft,type:'fixed_days',min:'1.5'}, {}), /whole number/)
  assert.throws(() => availabilityPatch({...draft,type:'range_days',min:'4',max:'2'}, {}), /greater/)
  assert.throws(() => availabilityPatch({...draft,type:'earliest_date',date:'2099-02-31'}, {}), /valid/)
  assert.throws(() => availabilityPatch({...draft,message:'x'.repeat(251)}, {}), /250/)
  assert.equal(availabilityPatch({...draft,min:'invalid',message:'   '}, {}).availability_message, null)
})
