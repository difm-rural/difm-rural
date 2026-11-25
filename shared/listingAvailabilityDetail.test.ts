import assert from 'node:assert/strict'
import test from 'node:test'
import {ESTIMATED_TIMING_NOTE, listingAvailability} from './listingAvailability'
import {listingAvailabilityDetail} from './listingAvailabilityDetail'

test('detail presentation separates compact lead time, message, disclaimer and date', () => {
  const listing = {
    availability_status: 'limited', lead_time_type: 'range_days', lead_time_min_days: 4,
    lead_time_max_days: 5, availability_message: ' Call about access.\nLeave the gate closed. ',
    availability_updated_at: '2026-11-26T01:00:00Z',
  } as const
  const detail = listingAvailabilityDetail(listing)!
  assert.equal(detail.tone, 'limited')
  assert.equal(detail.status, 'Limited availability')
  assert.equal(detail.leadLabel, 'Estimated lead time')
  assert.equal(detail.lead, '4\u20135 days')
  assert.equal(detail.message, 'Call about access.\nLeave the gate closed.')
  assert.equal(detail.disclaimer, ESTIMATED_TIMING_NOTE)
  assert.equal(detail.updated, 'Updated 26 Nov 2026')
  assert.equal(listingAvailability(listing).lead, 'Estimated lead time: 4 to 5 days')
})

test('legacy dates remain visible without a new status or an estimated-timing disclaimer', () => {
  assert.equal(listingAvailabilityDetail({}), null)
  const detail = listingAvailabilityDetail({availability: ['2026-12-04']})!
  assert.equal(detail.lead, 'Available from 4 Dec 2026')
  assert.equal(detail.leadLabel, '')
  assert.equal(detail.status, '')
  assert.equal(detail.disclaimer, '')
})

test('paused status is prominent data even without an estimate; contact provider is a separate option', () => {
  const paused = listingAvailabilityDetail({availability_status: 'paused', availability_updated_at: '2026-11-26T01:00:00Z', availability_message: ' '})!
  assert.equal(paused.status, 'Temporarily paused')
  assert.equal(paused.tone, 'paused')
  assert.equal(paused.lead, '')
  assert.equal(paused.message, '')
  const contact = listingAvailabilityDetail({lead_time_type:'contact_provider'})!
  assert.equal(contact.lead, 'Contact provider')
  assert.equal(contact.leadLabel, '')
  assert.equal(contact.disclaimer, '')
})
