// Shared, UI-free listing pricing/kind model — the single source of truth for
// both the React Native app and the web apps (admin-web, future provider web).
// Pure data + string/number helpers only: NO React, React Native, or bundler-
// specific imports, and no dependency on src/lib, so any bundler can consume it.
// If you add logic here, keep it dependency-free (see /shared refactor notes).

export const PRICING_TYPES = [
  { id: 'fixed', label: 'Fixed price' },
  { id: 'hourly', label: 'Hourly rate' },
  { id: 'day_rate', label: 'Day rate' },
  { id: 'per_unit', label: 'Per load/unit' },
  { id: 'quote_required', label: 'Estimate / quote' },
]

export const PAYMENT_OPTIONS = [
  { id: 'upfront', label: 'Pay upfront' },
  { id: 'on_completion', label: 'On completion' },
]

export const MATERIALS_OPTIONS = [
  { id: 'included', label: 'Included' },
  { id: 'estimate', label: 'Extra estimate' },
  { id: 'requester_supplies', label: 'Requester supplies' },
]
export const materialsLabel = (id) => MATERIALS_OPTIONS.find(o => o.id === id)?.label || '—'

export const ADDON_BASES = [
  { id: 'flat', label: 'Flat' },
  { id: 'per_km', label: 'Per km' },
  { id: 'per_unit', label: 'Per unit' },
]
// Display token for a display-only add-on: flat -> "+$120 float",
// per_km -> "+$3/km", per_unit -> "+$2.50/bale". Works on the create-screen
// state shape (string amount); label appended when present, unit defaults to "unit".
export function addOnDisplay(a) {
  const amt = String(a.amount ?? '').trim()
  const label = String(a.label || '').trim()
  const price = a.basis === 'per_km'
    ? `+$${amt}/km`
    : a.basis === 'per_unit'
    ? `+$${amt}/${(a.unit_label || 'unit').trim() || 'unit'}`
    : `+$${amt}`
  return label ? `${price} ${label}` : price
}

export const VARIANT_PRICING_TYPES = PRICING_TYPES.filter(pt => pt.id !== 'quote_required')
// Rate token for a variant (create-screen state shape, string rate). Unit
// defaults to "unit" so per_unit never renders a dangling "/".
export function variantRateToken(v) {
  const amt = String(v.rate ?? '').trim()
  if (v.pricing_type === 'hourly')   return `$${amt}/hr`
  if (v.pricing_type === 'day_rate') return `$${amt}/day`
  if (v.pricing_type === 'per_unit') return `$${amt}/${(v.unit_label || 'unit').trim() || 'unit'}`
  return `$${amt}`
}
export function variantDisplay(v) {
  const label = String(v.label || '').trim()
  const min = String(v.min_units ?? '').trim()
  return `${label ? label + ': ' : ''}${variantRateToken(v)}${min ? ` (min ${min})` : ''}`
}
// A variant is publishable only with a label and a finite positive rate.
export function isValidVariant(v) {
  const r = parseFloat(v.rate)
  return !!v.label.trim() && Number.isFinite(r) && r > 0
}

export const LISTING_KINDS = [
  { id: 'service',  label: 'Offer a service' },
  { id: 'grazing',  label: 'Grazing' },
  { id: 'hire',     label: 'Gear for hire' },
  { id: 'lease',    label: 'Space to lease' },
  { id: 'for_sale', label: 'Something for sale' },
]
export const KIND_IS_RESOURCE = { service: false, grazing: true, hire: true, lease: true, for_sale: true }
// Which kinds are enquiry-only (bypass bookings) vs bookable (service/hire).
// Single source of truth shared by the create flow and the listing detail.
export const KIND_ENQUIRY = ['for_sale', 'grazing', 'lease']

// Per-kind pricing defaults — applied to NEW listings only, still editable.
// service.pricingType '' == normalizePricingType(undefined), i.e. the canonical
// pre-L2 new-listing default (so switching to service is byte-for-byte unchanged).
export const KIND_PRICING_DEFAULTS = {
  service:  { pricingType: '',         unitLabel: '' },
  grazing:  { pricingType: 'per_unit', unitLabel: 'head/week' },
  hire:     { pricingType: 'day_rate', unitLabel: '' },
  lease:    { pricingType: 'per_unit', unitLabel: 'week' },
  for_sale: { pricingType: 'per_unit', unitLabel: 'bale' },
}
// Kind-aware DEFAULT pricing view. Maps to existing pricing_type values; only
// which types/unit/minimum show (and payment/materials) differ. service = today.
export const KIND_PRICING = {
  service:  { types: ['fixed', 'hourly', 'day_rate', 'per_unit', 'quote_required'], unit: 'free', showPayment: true,  showMaterials: true },
  hire:     { types: ['day_rate', 'per_unit', 'quote_required'], unitOptions: ['day', 'week'], showPayment: true, showMaterials: false },
  lease:    { types: ['per_unit', 'fixed', 'quote_required'], typeLabels: { per_unit: 'Per period', fixed: 'Fixed total' }, unitOptions: ['week', 'month'], minLabel: 'Minimum term', showPayment: false, showMaterials: false },
  grazing:  { types: ['per_unit', 'quote_required'], unitOptions: ['head/week', 'head/month', 'ha'], capacity: true, showPayment: false, showMaterials: false },
  for_sale: { types: ['per_unit', 'fixed', 'quote_required'], typeLabels: { per_unit: 'Per unit', fixed: 'Fixed lot' }, unitOptions: ['each', 'bale', 'tonne', 'kg'], unitAllowOther: true, minLabel: 'Minimum quantity', showPayment: false, showMaterials: false },
}
export function pricingTypeLabel(cfg, id) {
  return (cfg.typeLabels && cfg.typeLabels[id]) || PRICING_TYPES.find(p => p.id === id)?.label || id
}

export const KIND_COPY = {
  service:  { header: 'Advertise a service',        titlePlaceholder: 'e.g. Tractor topping with operator' },
  grazing:  { header: 'Advertise grazing',          titlePlaceholder: 'e.g. 8ha winter grazing, good fences & water' },
  hire:     { header: 'Advertise gear for hire',    titlePlaceholder: 'e.g. Tandem trailer, 3.5T' },
  lease:    { header: 'Advertise space to lease',   titlePlaceholder: 'e.g. Dry shed, 100m², secure' },
  for_sale: { header: 'Advertise an item for sale', titlePlaceholder: 'e.g. Meadow hay, small squares' },
}
export function step1Heading(kind) {
  return {
    service:  'What service can you offer?',
    grazing:  'What grazing do you have?',
    hire:     'What gear are you hiring out?',
    lease:    'What space are you leasing?',
    for_sale: 'What are you selling?',
  }[kind] || 'What service can you offer?'
}

// Normalise a free/legacy pricing_type string to a known id ('' when unknown).
export function normalizePricingType(value) {
  const v = String(value || '').toLowerCase()
  if (v === 'hourly') return 'hourly'
  if (v === 'fixed') return 'fixed'
  if (v === 'quote_required' || v === 'unknown') return 'quote_required'
  if (v === 'day_rate' || v === 'per_day') return 'day_rate'
  if (v === 'per_unit' || v === 'per_load' || v === 'per_job') return 'per_unit'
  return ''
}
