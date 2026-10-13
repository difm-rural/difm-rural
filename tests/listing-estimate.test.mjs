import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const source = await readFile(new URL('../src/lib/listingEstimate.js', import.meta.url), 'utf8')
const { listingEstimate, formatExtraCharge } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('minimum charge is a floor: one $50 hour costs at least $150, four cost $200', () => {
  const service = { pricing_type: 'hourly', rate: 50, min_charge: 150 }
  assert.equal(listingEstimate(service, null, 1).baseAmount, 150)
  assert.equal(listingEstimate(service, null, 4).baseAmount, 200)
})

test('quantity minimums apply to hourly, daily and per-unit estimates', () => {
  for (const pricing_type of ['hourly', 'day_rate', 'per_unit']) {
    const estimate = listingEstimate({ pricing_type, rate: '50', minimum_units: '3' }, null, 1)
    assert.equal(estimate.quantity, 3)
    assert.equal(estimate.baseAmount, 150)
  }
})

test('a selected variant uses its own rate and minimums', () => {
  const service = { pricing_type: 'hourly', rate: 50, minimum_units: 4, min_charge: 300 }
  const variant = { pricing_type: 'per_unit', rate: 20, min_units: 2, min_charge: 75 }
  assert.equal(listingEstimate(service, variant, 1).baseAmount, 75)
  assert.equal(listingEstimate(service, variant, 5).baseAmount, 100)
  assert.equal(listingEstimate(service, { pricing_type: 'hourly', rate: 10 }, 1).baseAmount, 10)
})

test('fixed prices apply once and still respect minimum charge', () => {
  const service = { pricing_type: 'fixed', rate: 100, minimum_units: 4 }
  assert.equal(listingEstimate(service, null, 4).baseAmount, 100)
  assert.equal(listingEstimate({ ...service, min_charge: 150 }, null, 4).baseAmount, 150)
})

test('quotes have no calculated price even with a minimum charge', () => {
  assert.equal(listingEstimate({ pricing_type: 'quote_required', min_charge: 150 }).baseAmount, null)
})

test('extras remain separate and amounts are consistent when reopened for review', () => {
  const service = { pricing_type: 'day_rate', rate: 100, min_charge: 250,
    pricing_add_ons: [{ label: 'Delivery', basis: 'flat', amount: 75 }] }
  const detail = listingEstimate(service, null, 2)
  const review = listingEstimate(service, null, detail.quantity)
  assert.equal(detail.baseAmount, 250)
  assert.equal(review.baseAmount, detail.baseAmount)
  assert.equal(formatExtraCharge(service.pricing_add_ons[0]), '+$75.00')
  assert.equal(formatExtraCharge({ amount: 3, basis: 'per_km' }), '+$3.00/km')
  assert.equal(formatExtraCharge({ amount: 2.5, basis: 'per_unit', unit_label: 'bale' }), '+$2.50/bale')
  assert.equal(listingEstimate({ pricing_type: 'hourly', rate: 0.1 }, null, 3).baseAmount, 0.3)
})
