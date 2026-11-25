import assert from 'node:assert/strict'
import test from 'node:test'
import { bookingQuantityLimits, canIncreaseBookingQuantity, clampBookingQuantity, validateBookingQuantity } from '../shared/bookingQuantity.ts'
import { listingEstimate, reviewBookingQuantity } from '../shared/listingEstimate.ts'
import { openBooking } from './support/booking-confirm-screen.mjs'

const grazing = { kind: 'grazing', pricing_type: 'per_unit', unit_label: 'head/week', rate: 10, minimum_units: 1, max_units: 2 }
const limits = bookingQuantityLimits(grazing)

test('valid grazing quantities use the listing capacity as the maximum and price that exact quantity', () => {
  assert.deepEqual(limits, { minimum: 1, maximum: 2 })
  for (const raw of [1, 2, '1', '2', '2.0']) {
    const review = reviewBookingQuantity(grazing, null, raw)
    assert.equal(review.ok, true)
    assert.equal(review.quantity, Number(raw))
    assert.equal(review.amount, Number(raw) * 10)
    assert.equal(review.message, null)
    assert.equal(listingEstimate(grazing, null, review.quantity).quantity, review.quantity)
    assert.equal(listingEstimate(grazing, null, review.quantity).baseAmount, review.amount)
  }
  assert.equal(canIncreaseBookingQuantity(1, limits), true)
  assert.equal(canIncreaseBookingQuantity(2, limits), false)
  assert.equal(clampBookingQuantity(2, limits), 2)
})

test('a quantity above grazing capacity is rejected and is not priced as the smaller capacity', () => {
  const review = reviewBookingQuantity(grazing, null, '4')
  assert.equal(review.ok, false)
  assert.equal(review.quantity, null)
  assert.equal(review.amount, null)
  assert.match(review.message, /up to 2 head/)
  assert.match(review.message, /Enter 2 or fewer/)
  assert.equal(validateBookingQuantity(4, limits).ok, false)
  assert.equal(listingEstimate(grazing, null, 4).baseAmount, 20)
  assert.notEqual(review.amount, listingEstimate(grazing, null, 4).baseAmount)
})

test('empty and invalid quantities have no estimate and cannot be submitted as a price', () => {
  for (const raw of ['', '   ', null, undefined, 'abc', 'head', Number.NaN, Number.POSITIVE_INFINITY, true, 0, -2, '0']) {
    const review = reviewBookingQuantity(grazing, null, raw)
    assert.equal(review.ok, false, String(raw))
    assert.equal(review.amount, null)
    assert.equal(review.quantity, null)
    assert.match(review.message, /Enter /)
  }
  const below = reviewBookingQuantity({ ...grazing, minimum_units: 2, max_units: 10 }, null, 1)
  assert.equal(below.ok, false)
  assert.match(below.message, /at least 2/)
  assert.equal(below.amount, null)
})

test('capacity applies only to grazing head periods, and fixed prices stay a single charge', () => {
  assert.equal(bookingQuantityLimits({ ...grazing, unit_label: 'ha' }).maximum, null)
  assert.equal(bookingQuantityLimits({ ...grazing, kind: 'service' }).maximum, null)
  assert.equal(reviewBookingQuantity({ ...grazing, unit_label: 'head/month' }, null, 2).amount, 20)
  assert.equal(reviewBookingQuantity({ ...grazing, max_units: 2, minimum_units: 5 }, null, 5).ok, true)
  const fixed = reviewBookingQuantity({ pricing_type: 'fixed', rate: 80, minimum_units: 4 }, null, 4)
  assert.equal(fixed.ok, true)
  assert.equal(fixed.quantity, 1)
  assert.equal(fixed.amount, 80)
  const quote = reviewBookingQuantity({ ...grazing, pricing_type: 'quote_required', rate: 0 }, null, 4)
  assert.equal(quote.ok, true)
  assert.equal(quote.quantity, 1)
  assert.equal(quote.amount, null)
})

const mobile = { id: 'listing', provider_id: 'provider', kind: 'grazing', title: 'Winter grazing', pricing_type: 'per_unit', rate: 50, unit_label: 'head/week', minimum_units: 1, max_units: 2, profile: { full_name: 'Peter' } }

test('mobile confirmation books the maximum quantity at that quantity\'s price', async () => {
  const screen = openBooking({ service: mobile, quantity: 2 })
  assert.ok(screen.texts().includes('Base estimate') || screen.texts().includes('$100'))
  assert.match(screen.texts(), /\$100/)
  await screen.press('Send booking request')
  assert.equal(screen.log.writes.length, 1)
  assert.equal(screen.log.writes[0].payload.quantity, 2)
  assert.equal(screen.log.writes[0].payload.total_amount, 100)
  assert.equal(screen.log.alerts.length, 0)
})

test('mobile confirmation will not send a quantity above grazing capacity', async () => {
  const screen = openBooking({ service: mobile, quantity: 4 })
  assert.match(screen.texts(), /up to 2 head/)
  assert.equal(screen.texts().includes('$40'), false)
  assert.equal(screen.texts().includes('$200'), false)
  const button = screen.find('Button', p => p.title === 'Send booking request')
  assert.equal(button.props.disabled, true)
  await screen.press('Send booking request')
  assert.equal(screen.log.writes.length, 0)
  assert.match(screen.log.alerts[0].join(' '), /up to 2 head/)
})
