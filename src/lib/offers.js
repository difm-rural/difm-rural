// Shared vocabulary + formatting for provider offers (bids), so the offer form
// and every place that displays an offer read the same. Mirrors the service
// pricing model (see CreateServiceScreen / lib pricing).

// Pricing basis the provider chooses for their offer.
export const OFFER_PRICING_TYPES = [
  { id: 'fixed',    label: 'Fixed price' },
  { id: 'hourly',   label: 'Hourly rate' },
  { id: 'per_unit', label: 'Per unit' },
  { id: 'quote',    label: 'Estimate' },
]

// Materials handling — only relevant when the job asks the provider to supply
// materials (jobs.materials_type === 'provider').
export const OFFER_MATERIALS_OPTIONS = [
  { id: 'included', label: 'Included in price' },
  { id: 'estimate', label: 'Estimated, at actuals' },
  { id: 'quote',    label: 'Quoted separately' },
]

export const OFFER_MATERIALS_LABELS = {
  included: 'Materials included in price',
  estimate: 'Materials estimated, charged at actual cost',
  quote:    'Materials quoted separately',
}

// Neutral status wording shown to the PROVIDER about their own offer — no
// marketplace/ranking signals (offers are private between provider & requester).
export function offerStatusLabel(status) {
  switch (status) {
    case 'pending':   return 'Offer sent'
    case 'accepted':  return 'Accepted'
    case 'rejected':  return 'Not selected'
    case 'withdrawn': return 'Withdrawn'
    default:          return status || ''
  }
}

// Formats an offer amount according to its pricing basis (for display).
export function formatOfferAmount(amount, pricingType) {
  switch (pricingType) {
    case 'hourly':   return `$${amount}/hr`
    case 'per_unit': return `$${amount}/unit`
    case 'quote':    return `$${amount} est.`
    default:         return `$${amount} NZD`
  }
}
