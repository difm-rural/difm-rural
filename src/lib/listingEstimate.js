export const BASE_ESTIMATE_EXPLANATION = 'Extra charges may apply — agree the final price with the provider.'
export const EXTRA_CHARGES_EXPLANATION = 'These charges are not included in the base estimate. Agree which apply with the provider.'

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

// Minimum charges are floors, not extra charges. Variants use their own pricing
// and minimums; a fixed price applies once, irrespective of passed quantity.
export function listingEstimate(service, selectedOption = null, quantity = 1) {
  const pricing = selectedOption || service || {}
  const pricingType = pricing.pricing_type
  const perQuantity = ['hourly', 'day_rate', 'per_unit'].includes(pricingType)
  const minimumUnits = Math.max(1, nonNegativeNumber(selectedOption ? pricing.min_units : pricing.minimum_units, 1))
  const unitLabel = pricing.unit_label || ''
  const grazingCapacity = service?.kind === 'grazing' && /^head\/(week|month)$/.test(unitLabel)
    ? nonNegativeNumber(service.max_units) : 0
  const maximumUnits = grazingCapacity >= minimumUnits ? grazingCapacity : Infinity
  const effectiveQuantity = perQuantity ? Math.min(maximumUnits, Math.max(minimumUnits, nonNegativeNumber(quantity, 1))) : 1
  const minimumCharge = nonNegativeNumber(pricing.min_charge)
  const baseAmount = pricingType === 'quote_required' ? null
    : Number(Math.max(effectiveQuantity * nonNegativeNumber(pricing.rate), minimumCharge).toFixed(2))
  return { pricingType, quantity: effectiveQuantity, minimumUnits, minimumCharge, baseAmount }
}

export function formatExtraCharge(charge) {
  const amount = Number(charge.amount).toFixed(2)
  if (charge.basis === 'per_km') return `+$${amount}/km`
  if (charge.basis === 'per_unit') return `+$${amount}/${charge.unit_label || 'unit'}`
  return `+$${amount}`
}
