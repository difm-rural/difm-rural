// One capacity rule for web, mobile and booking creation. Grazing charged per
// head for a week or a month cannot be booked above the listing's max_units.
// Other listings have no capacity cap. Callers that show a price must use the
// validated quantity from reviewBookingQuantity in listingEstimate, so the
// number on screen and the number in the price are the same.

export type QuantityListing = {
  kind?: string | null
  pricing_type?: string | null
  unit_label?: string | null
  minimum_units?: number | string | null
  max_units?: number | string | null
}

export type QuantityOption = {
  pricing_type?: string | null
  unit_label?: string | null
  min_units?: number | string | null
}

export type QuantityLimits = {
  minimum: number
  maximum: number | null
}

function nonNegativeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

export function formatBookingQuantity(value: number) {
  return String(value)
}

export function bookingCapacityMessage(maximum: number) {
  const shown = formatBookingQuantity(maximum)
  return `This listing can take up to ${shown} head. Enter ${shown} or fewer.`
}

export function bookingQuantityLimits(service?: QuantityListing | null, option?: QuantityOption | null): QuantityLimits {
  const pricing = option || service || {}
  const minimum = Math.max(1, nonNegativeNumber(option ? option.min_units : service?.minimum_units, 1))
  const unitLabel = pricing.unit_label || ''
  const capacity = service?.kind === 'grazing' && /^head\/(week|month)$/.test(unitLabel)
    ? nonNegativeNumber(service.max_units) : 0
  // A capacity below the minimum cannot be applied without making every
  // quantity invalid. Leave those listings uncapped, matching the estimate.
  const maximum = capacity >= minimum ? capacity : null
  return { minimum, maximum }
}

export type QuantityValidation = {
  ok: boolean
  quantity: number | null
  message: string | null
}

export function validateBookingQuantity(raw: unknown, limits: QuantityLimits): QuantityValidation {
  if (raw == null) return { ok: false, quantity: null, message: 'Enter a quantity.' }
  let quantity: number
  if (typeof raw === 'number') quantity = raw
  else if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return { ok: false, quantity: null, message: 'Enter a quantity.' }
    quantity = Number(text)
  } else return { ok: false, quantity: null, message: 'Enter a valid quantity.' }
  if (!Number.isFinite(quantity)) return { ok: false, quantity: null, message: 'Enter a valid quantity.' }
  if (quantity < limits.minimum) return { ok: false, quantity: null, message: `Enter at least ${formatBookingQuantity(limits.minimum)}.` }
  if (limits.maximum != null && quantity > limits.maximum) return { ok: false, quantity: null, message: bookingCapacityMessage(limits.maximum) }
  return { ok: true, quantity, message: null }
}

export function clampBookingQuantity(value: number, limits: QuantityLimits) {
  const numeric = Number.isFinite(value) ? value : limits.minimum
  const raised = Math.max(limits.minimum, numeric)
  return limits.maximum == null ? raised : Math.min(limits.maximum, raised)
}

export function canIncreaseBookingQuantity(quantity: number, limits: QuantityLimits) {
  const current = clampBookingQuantity(quantity, limits)
  return limits.maximum == null || current < limits.maximum
}
