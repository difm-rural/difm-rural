'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import {
  LISTING_KINDS, KIND_PRICING, KIND_PRICING_DEFAULTS,
  PAYMENT_OPTIONS, MATERIALS_OPTIONS,
  ADDON_BASES, addOnDisplay, VARIANT_PRICING_TYPES, variantDisplay, isValidVariant,
  pricingTypeLabel, normalizePricingType, formatRate,
  type ListingKind,
} from '@shared/listingPricing'
import { LISTING_CATEGORIES } from '@shared/categories'
import { createClient } from '@/lib/supabase/client'

// B1 owns the non-pricing fields; B2a adds the DEFAULT pricing view (driven entirely
// by KIND_PRICING[kind] from @shared — no rules derived here). The advanced levers
// (add-ons, rate variants, terms, min charge) are B2b — the placeholder <section> below
// marks where they slot in. EDIT remains a PARTIAL update: it writes only the fields
// B1/B2a own and never touches B2b's advanced fields, closed_at or close_reason.

const KIND_LABEL: Record<string, string> = {
  service: 'Service', grazing: 'Grazing', hire: 'Hire', lease: 'Lease', for_sale: 'For sale',
}

// Stored (jsonb) shapes for the advanced levers — all fields optional on read.
type StoredAddOn = { label?: string; amount?: number | string; basis?: string; unit_label?: string; optional?: boolean }
type StoredVariant = { label?: string; pricing_type?: string; rate?: number | string; unit_label?: string; min_units?: number | string; min_charge?: number | string }

export type EditListing = {
  id: string
  kind: string | null
  title: string | null
  category: string | null
  description: string | null
  location_name: string | null
  travel_range_km: number | null
  pricing_type: string | null
  rate: number | null
  unit_label: string | null
  minimum_units: number | null
  max_units: number | null
  payment_timing: string | null
  materials: string | null
  pricing_add_ons: StoredAddOn[] | null
  pricing_variants: StoredVariant[] | null
  pricing_terms: string | null
  min_charge: number | null
  card_headline: string | null
  card_supporting_text: string | null
  card_style: string | null
  availability: string[] | null
}

// Listing-card appearance options — labels match the RN create flow.
const CARD_STYLES: { id: string; label: string }[] = [
  { id: 'bold', label: 'Bold overlay' },
  { id: 'bottom', label: 'Bottom band' },
  { id: 'clean', label: 'Clean panel' },
]

// Editable row state for the repeaters (all-string inputs; compatible with the
// @shared AddOnDraft / VariantDraft shapes consumed by addOnDisplay/isValidVariant).
type AddOnRow = { label: string; amount: string; basis: string; unit_label: string; optional: boolean }
type VariantRow = { label: string; pricing_type: string; rate: string; unit_label: string; min_units: string; min_charge: string }

export function ListingForm({
  mode,
  userId,
  listing,
}: {
  mode: 'new' | 'edit'
  userId: string
  listing?: EditListing
}) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  // On NEW the kind is chosen in-form (empty until picked); on EDIT it is fixed.
  const [kind, setKind] = useState<ListingKind | ''>(
    mode === 'edit' ? ((listing?.kind as ListingKind) ?? '') : '',
  )
  const [title, setTitle] = useState(listing?.title ?? '')
  const [category, setCategory] = useState(listing?.category ?? '')
  const [description, setDescription] = useState(listing?.description ?? '')
  const [locationName, setLocationName] = useState(listing?.location_name ?? '')
  const [travelRange, setTravelRange] = useState(
    listing?.travel_range_km != null ? String(listing.travel_range_km) : '',
  )

  // Pricing (default view) — populated from the row on EDIT, mirroring RN.
  const [pricingType, setPricingType] = useState(
    mode === 'edit' ? normalizePricingType(listing?.pricing_type) : '',
  )
  const [rate, setRate] = useState(listing?.rate != null ? String(listing.rate) : '')
  const [unitLabel, setUnitLabel] = useState(listing?.unit_label ?? '')
  const [minimumUnits, setMinimumUnits] = useState(
    listing?.minimum_units != null && Number(listing.minimum_units) !== 1
      ? String(listing.minimum_units)
      : '',
  )
  const [maxUnits, setMaxUnits] = useState(listing?.max_units != null ? String(listing.max_units) : '')
  const [paymentTiming, setPaymentTiming] = useState(listing?.payment_timing ?? 'on_completion')
  const [materials, setMaterials] = useState(listing?.materials ?? 'included')

  // Advanced levers (B2b) — populated from the row on EDIT, mirroring RN.
  const [minCharge, setMinCharge] = useState(listing?.min_charge != null ? String(listing.min_charge) : '')
  const [pricingTerms, setPricingTerms] = useState(listing?.pricing_terms ?? '')
  const [pricingAddOns, setPricingAddOns] = useState<AddOnRow[]>(
    (listing?.pricing_add_ons ?? []).map(a => ({
      label: a.label ?? '',
      amount: a.amount != null ? String(a.amount) : '',
      basis: a.basis ?? 'flat',
      unit_label: a.unit_label ?? '',
      optional: !!a.optional,
    })),
  )
  const [pricingVariants, setPricingVariants] = useState<VariantRow[]>(
    (listing?.pricing_variants ?? []).map(v => ({
      label: v.label ?? '',
      pricing_type: v.pricing_type ?? 'fixed',
      rate: v.rate != null ? String(v.rate) : '',
      unit_label: v.unit_label ?? '',
      min_units: v.min_units != null ? String(v.min_units) : '',
      min_charge: v.min_charge != null ? String(v.min_charge) : '',
    })),
  )
  // Auto-expand on edit when any advanced lever is already set, so existing values show.
  const [advancedOpen, setAdvancedOpen] = useState(
    mode === 'edit' && (
      (listing?.pricing_variants?.length ?? 0) > 0 ||
      (listing?.pricing_add_ons?.length ?? 0) > 0 ||
      !!listing?.pricing_terms ||
      listing?.min_charge != null
    ),
  )

  // Card creative (B3) — optional listing-card polish.
  const [cardHeadline, setCardHeadline] = useState(listing?.card_headline ?? '')
  const [cardSupportingText, setCardSupportingText] = useState(listing?.card_supporting_text ?? '')
  const [cardStyle, setCardStyle] = useState<string | null>(listing?.card_style ?? null)

  // Availability (B3) — null = available now; else a single YYYY-MM-DD array.
  const initialAvailFrom = Array.isArray(listing?.availability) && listing!.availability![0]
    ? String(listing!.availability![0]).split('T')[0]
    : ''
  const [availMode, setAvailMode] = useState<'now' | 'from'>(initialAvailFrom ? 'from' : 'now')
  const [availableFrom, setAvailableFrom] = useState(initialAvailFrom)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cfg = kind ? KIND_PRICING[kind] : null
  const categoryOptions = kind ? LISTING_CATEGORIES[kind] : []

  // Mirror RN selectKind: changing kind (NEW only) clears a now-invalid category and
  // applies the per-kind pricing defaults, resetting the rest of the pricing inputs.
  function selectKind(k: ListingKind) {
    if (mode === 'edit') return // kind is locked on an existing listing
    setKind(k)
    setCategory('')
    const d = KIND_PRICING_DEFAULTS[k] ?? { pricingType: '', unitLabel: '' }
    setPricingType(d.pricingType)
    setUnitLabel(d.unitLabel)
    setRate('')
    setMinimumUnits('')
    setMaxUnits('')
    setPaymentTiming('on_completion')
    setMaterials('included')
    setMinCharge('')
    setPricingTerms('')
    setPricingAddOns([])
    setPricingVariants([])
    setAdvancedOpen(false)
    setCardHeadline('')
    setCardSupportingText('')
    setCardStyle(null)
    setAvailMode('now')
    setAvailableFrom('')
  }

  // Add-on row handlers
  const addAddOn = () =>
    setPricingAddOns(rows => [...rows, { label: '', amount: '', basis: 'flat', unit_label: '', optional: false }])
  const updateAddOn = (i: number, patch: Partial<AddOnRow>) =>
    setPricingAddOns(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const removeAddOn = (i: number) =>
    setPricingAddOns(rows => rows.filter((_, idx) => idx !== i))

  // Variant row handlers
  const addVariant = () =>
    setPricingVariants(rows => [...rows, { label: '', pricing_type: 'fixed', rate: '', unit_label: '', min_units: '', min_charge: '' }])
  const updateVariant = (i: number, patch: Partial<VariantRow>) =>
    setPricingVariants(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const removeVariant = (i: number) =>
    setPricingVariants(rows => rows.filter((_, idx) => idx !== i))

  // Grazing head-vs-ha branch — identical rule to RN renderStep3.
  const isGrazingHeadCapacity = !!cfg?.capacity && (unitLabel === 'head/week' || unitLabel === 'head/month')
  const isGrazingHa = !!cfg?.capacity && unitLabel === 'ha'
  const isOtherUnit = !!cfg?.unitAllowOther && Array.isArray(cfg?.unitOptions) && !cfg.unitOptions.includes(unitLabel)

  const canSave = !!kind && !!title.trim() && !!category && !!locationName.trim()

  async function onSave() {
    if (!canSave || !cfg) return
    setBusy(true); setError('')

    // --- Non-pricing (B1) ---
    const trimmedTravel = travelRange.trim()
    const parsedTravel = trimmedTravel ? parseFloat(trimmedTravel) : null

    // --- Pricing (B2a), matching RN handlePublish rules exactly ---
    const supportsMinimum = pricingType !== 'quote_required' && pricingType !== 'fixed'
    const parsedRate = parseFloat(rate)
    const publishRate = pricingType === 'quote_required'
      ? 0                                       // match RN byte-for-byte: quote stores 0
      : (Number.isFinite(parsedRate) ? parsedRate : null)
    const parsedMin = parseFloat(minimumUnits)
    const publishMinUnits = supportsMinimum && Number.isFinite(parsedMin) && parsedMin > 0 ? parsedMin : 1
    const parsedMax = parseFloat(maxUnits)
    const publishMaxUnits = isGrazingHeadCapacity && Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null

    // --- Advanced levers (B2b), matching RN handlePublish sanitise rules exactly ---
    const parsedMinCharge = parseFloat(minCharge)
    const publishMinCharge = supportsMinimum && Number.isFinite(parsedMinCharge) && parsedMinCharge >= 0
      ? parsedMinCharge
      : null
    // Drop rows missing a label OR amount; keep add-ons display-only.
    const cleanAddOns = pricingAddOns
      .filter(a => a.label.trim() && String(a.amount).trim())
      .map(a => {
        const amt = parseFloat(a.amount)
        return {
          label: a.label.trim(),
          amount: Number.isFinite(amt) ? amt : 0,
          basis: a.basis || 'flat',
          optional: !!a.optional,
          ...(a.basis === 'per_unit' ? { unit_label: a.unit_label.trim() || null } : {}),
        }
      })
    // Only publish variants with a label and a finite positive rate; never store rate: 0.
    const cleanVariants = pricingVariants
      .filter(isValidVariant)
      .map(v => {
        const mu = parseFloat(v.min_units)
        const mc = parseFloat(v.min_charge)
        return {
          label: v.label.trim(),
          pricing_type: v.pricing_type || 'fixed',
          rate: parseFloat(v.rate),
          ...(v.pricing_type === 'per_unit' ? { unit_label: v.unit_label.trim() || null } : {}),
          ...(Number.isFinite(mu) && mu > 0 ? { min_units: mu } : {}),
          ...(Number.isFinite(mc) && mc >= 0 ? { min_charge: mc } : {}),
        }
      })

    const base = {
      // B1 fields
      title: title.trim(),
      category,
      description: description.trim() || null,
      location_name: locationName.trim(),
      travel_range_km: Number.isFinite(parsedTravel as number) ? parsedTravel : null,
      // B2a default-view pricing
      pricing_type: pricingType,
      rate: publishRate,
      unit_label: pricingType === 'per_unit' ? (unitLabel.trim() || null) : null,
      minimum_units: kind === 'grazing' ? 1 : publishMinUnits,
      max_units: publishMaxUnits,
      // B2b advanced levers — now owned by the form (written on both create and edit).
      pricing_add_ons: cleanAddOns,
      pricing_variants: cleanVariants,
      pricing_terms: pricingTerms.trim() || null,
      min_charge: publishMinCharge,
      // B3 card creative + availability.
      card_headline: cardHeadline.trim() || null,
      card_supporting_text: cardSupportingText.trim() || null,
      card_style: cardStyle || null, // only 'bold' | 'bottom' | 'clean' | null (check constraint)
      availability: availMode === 'from' && availableFrom ? [availableFrom] : null,
    }

    if (mode === 'edit' && listing) {
      // Partial update: payment/materials only when their control is shown, so a hidden
      // field keeps its existing value. B2b fields, closed_at, close_reason, kind and
      // direction are never included.
      const fields: Record<string, unknown> = { ...base }
      if (cfg.showPayment) fields.payment_timing = paymentTiming
      if (cfg.showMaterials) fields.materials = materials

      const { error: e } = await supabase
        .from('services')
        .update(fields)
        .eq('id', listing.id)
        .eq('provider_id', userId)
      setBusy(false)
      if (e) { setError('Couldn’t save — retry.'); return }
    } else {
      // Create mirrors an RN create: payment_timing/materials always written (control
      // value when shown, RN default otherwise). B2b advanced columns are omitted so
      // they take their DB defaults ([] / [] / null / null).
      const { error: e } = await supabase.from('services').insert({
        provider_id: userId,
        kind,
        direction: 'offering',
        is_active: true,
        ...base,
        payment_timing: cfg.showPayment ? paymentTiming : 'on_completion',
        materials: cfg.showMaterials ? materials : 'included',
      })
      setBusy(false)
      if (e) { setError('Couldn’t create — retry.'); return }
    }

    router.push('/listings')
    router.refresh()
  }

  return (
    <div className="lform">
      {/* Kind */}
      <div className="lform-field">
        <label>Listing type</label>
        {mode === 'edit' ? (
          <p className="lform-fixed">
            <span className="kind-tag">{KIND_LABEL[kind] ?? kind}</span>
            <span className="muted lform-fixed-note">Type can’t be changed on an existing listing.</span>
          </p>
        ) : (
          <div className="lform-kinds">
            {LISTING_KINDS.map(k => (
              <button
                type="button"
                key={k.id}
                className={kind === k.id ? 'lform-kind active' : 'lform-kind'}
                onClick={() => selectKind(k.id as ListingKind)}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Title */}
      <div className="lform-field">
        <label htmlFor="lf-title">Title <span className="req">*</span></label>
        <input
          id="lf-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Tractor topping with operator"
        />
      </div>

      {/* Category */}
      <div className="lform-field">
        <label htmlFor="lf-category">Category <span className="req">*</span></label>
        <select
          id="lf-category"
          value={category}
          onChange={e => setCategory(e.target.value)}
          disabled={!kind}
        >
          <option value="">{kind ? 'Choose a category' : 'Pick a listing type first'}</option>
          {categoryOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div className="lform-field">
        <label htmlFor="lf-desc">Description</label>
        <textarea
          id="lf-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="What you’re offering, condition, terms, anything a buyer should know."
        />
      </div>

      {/* Location */}
      <div className="lform-field">
        <label htmlFor="lf-location">Service area / location <span className="req">*</span></label>
        <input
          id="lf-location"
          value={locationName}
          onChange={e => setLocationName(e.target.value)}
          placeholder="e.g. Waikato, around Cambridge"
        />
      </div>

      {/* Travel range */}
      <div className="lform-field">
        <label htmlFor="lf-travel">Travel range (km)</label>
        <input
          id="lf-travel"
          inputMode="numeric"
          value={travelRange}
          onChange={e => setTravelRange(e.target.value)}
          placeholder="Optional — how far you’ll travel"
        />
      </div>

      {/* Pricing — default view, driven by KIND_PRICING[kind] */}
      {cfg ? (
        <section className="lform-pricing">
          <h2>How is it priced?</h2>

          {/* Pricing type */}
          <div className="lform-field">
            <label>Pricing</label>
            <div className="lseg">
              {cfg.types.map(id => (
                <button
                  type="button"
                  key={id}
                  className={pricingType === id ? 'lseg-btn active' : 'lseg-btn'}
                  onClick={() => setPricingType(id)}
                >
                  {pricingTypeLabel(cfg, id)}
                </button>
              ))}
            </div>
          </div>

          {pricingType === 'quote_required' ? (
            <div className="lform-note">
              <strong>Priced on enquiry</strong>
              <span>Use this when price depends on distance, job size, materials, or conditions.</span>
            </div>
          ) : (
            <>
              <div className="lform-row">
                <div className="lform-field">
                  <label htmlFor="lf-rate">Rate</label>
                  <input
                    id="lf-rate"
                    inputMode="numeric"
                    value={rate}
                    onChange={e => setRate(e.target.value)}
                    placeholder="120"
                  />
                </div>
                {pricingType === 'per_unit' && cfg.unit === 'free' && (
                  <div className="lform-field">
                    <label htmlFor="lf-unit">Unit</label>
                    <input
                      id="lf-unit"
                      value={unitLabel}
                      onChange={e => setUnitLabel(e.target.value)}
                      placeholder="trough"
                    />
                  </div>
                )}
              </div>

              {pricingType === 'per_unit' && Array.isArray(cfg.unitOptions) && (
                <div className="lform-field">
                  <label>Unit</label>
                  <div className="lseg">
                    {cfg.unitOptions.map(u => (
                      <button
                        type="button"
                        key={u}
                        className={unitLabel === u ? 'lseg-btn active' : 'lseg-btn'}
                        onClick={() => setUnitLabel(u)}
                      >
                        {u}
                      </button>
                    ))}
                    {cfg.unitAllowOther && (
                      <button
                        type="button"
                        className={isOtherUnit ? 'lseg-btn active' : 'lseg-btn'}
                        onClick={() => setUnitLabel('')}
                      >
                        Other
                      </button>
                    )}
                  </div>
                  {cfg.unitAllowOther && isOtherUnit && (
                    <input
                      value={unitLabel}
                      onChange={e => setUnitLabel(e.target.value)}
                      placeholder="Unit (e.g. crate)"
                      style={{ marginTop: 8 }}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {/* Minimum / capacity */}
          {isGrazingHeadCapacity ? (
            <div className="lform-field">
              <label htmlFor="lf-cap">Capacity <span className="optional">(optional)</span></label>
              <input
                id="lf-cap"
                inputMode="numeric"
                value={maxUnits}
                onChange={e => setMaxUnits(e.target.value)}
                placeholder="e.g. 200"
              />
              <p className="lform-help">Grazing for up to {maxUnits.trim() || 'N'} head</p>
            </div>
          ) : isGrazingHa ? (
            <p className="lform-help">For the full term — usually 12+ months</p>
          ) : (pricingType !== 'quote_required' && pricingType !== 'fixed') ? (
            <div className="lform-field">
              <label htmlFor="lf-min">
                {cfg.minLabel ||
                  `Minimum ${pricingType === 'hourly' ? 'hours' : pricingType === 'day_rate' ? 'days' : (unitLabel.trim() || 'units')}`}
                {' '}<span className="optional">(optional)</span>
              </label>
              <input
                id="lf-min"
                inputMode="numeric"
                value={minimumUnits}
                onChange={e => setMinimumUnits(e.target.value)}
                placeholder="e.g. 4"
              />
            </div>
          ) : null}

          {/* Payment timing */}
          {cfg.showPayment && (
            <div className="lform-field">
              <label>When is payment due?</label>
              <div className="lseg">
                {PAYMENT_OPTIONS.map(o => (
                  <button
                    type="button"
                    key={o.id}
                    className={paymentTiming === o.id ? 'lseg-btn active' : 'lseg-btn'}
                    onClick={() => setPaymentTiming(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Materials */}
          {cfg.showMaterials && (
            <div className="lform-field">
              <label>Are materials included?</label>
              <div className="lseg">
                {MATERIALS_OPTIONS.map(o => (
                  <button
                    type="button"
                    key={o.id}
                    className={materials === o.id ? 'lseg-btn active' : 'lseg-btn'}
                    onClick={() => setMaterials(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live preview — same formatRate as RN, so web and app render identically */}
          {pricingType && (
            <div className="lform-preview">
              <span className="lform-preview-label">Displays as</span>
              <span className="lform-preview-val">{formatRate(pricingType, rate, unitLabel)}</span>
            </div>
          )}

          {/* Advanced levers (B2b) */}
          <div className="lform-advanced">
            <button
              type="button"
              className="lform-advanced-toggle"
              onClick={() => setAdvancedOpen(v => !v)}
              aria-expanded={advancedOpen}
            >
              <span>More pricing options</span>
              <span className="lform-advanced-chevron">{advancedOpen ? '▾' : '▸'}</span>
            </button>

            {advancedOpen && (
              <div className="lform-advanced-body">
                {/* Minimum charge */}
                <div className="lform-field">
                  <label htmlFor="lf-mincharge">Minimum charge <span className="optional">(optional)</span></label>
                  <input
                    id="lf-mincharge"
                    inputMode="numeric"
                    value={minCharge}
                    onChange={e => setMinCharge(e.target.value)}
                    placeholder="e.g. 80"
                  />
                  <p className="lform-help">A floor regardless of quantity. Not stored on quote or fixed-price listings.</p>
                </div>

                {/* Extra charges (add-ons) */}
                <div className="lform-field">
                  <label>Extra charges</label>
                  {pricingAddOns.length === 0 && (
                    <p className="lform-help">Optional add-ons shown on the listing (e.g. float fee, travel).</p>
                  )}
                  {pricingAddOns.map((a, i) => (
                    <div className="lform-repeat" key={i}>
                      <div className="lform-repeat-grid">
                        <input
                          placeholder="Label (e.g. Float fee)"
                          value={a.label}
                          onChange={e => updateAddOn(i, { label: e.target.value })}
                        />
                        <input
                          inputMode="numeric"
                          placeholder="Amount"
                          value={a.amount}
                          onChange={e => updateAddOn(i, { amount: e.target.value })}
                        />
                      </div>
                      <div className="lseg">
                        {ADDON_BASES.map(b => (
                          <button
                            type="button"
                            key={b.id}
                            className={a.basis === b.id ? 'lseg-btn active' : 'lseg-btn'}
                            onClick={() => updateAddOn(i, { basis: b.id })}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                      {a.basis === 'per_unit' && (
                        <input
                          placeholder="Unit (e.g. bale)"
                          value={a.unit_label}
                          onChange={e => updateAddOn(i, { unit_label: e.target.value })}
                        />
                      )}
                      <label className="lform-check">
                        <input
                          type="checkbox"
                          checked={a.optional}
                          onChange={e => updateAddOn(i, { optional: e.target.checked })}
                        />
                        Optional for the requester
                      </label>
                      <div className="lform-repeat-foot">
                        <span className="lform-repeat-preview">{addOnDisplay(a)}</span>
                        <button type="button" className="lform-repeat-remove" onClick={() => removeAddOn(i)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="lform-add" onClick={addAddOn}>+ Add a charge</button>
                </div>

                {/* More rate options (variants) */}
                <div className="lform-field">
                  <label>More rate options</label>
                  {pricingVariants.length === 0 && (
                    <p className="lform-help">Alternative rates buyers can pick (e.g. half-day, weekend). Blank or zero-rate rows are dropped.</p>
                  )}
                  {pricingVariants.map((v, i) => (
                    <div className="lform-repeat" key={i}>
                      <input
                        placeholder="Label (e.g. Half day)"
                        value={v.label}
                        onChange={e => updateVariant(i, { label: e.target.value })}
                      />
                      <div className="lseg">
                        {VARIANT_PRICING_TYPES.map(pt => (
                          <button
                            type="button"
                            key={pt.id}
                            className={v.pricing_type === pt.id ? 'lseg-btn active' : 'lseg-btn'}
                            onClick={() => updateVariant(i, { pricing_type: pt.id })}
                          >
                            {pt.label}
                          </button>
                        ))}
                      </div>
                      <div className="lform-repeat-grid">
                        <input
                          inputMode="numeric"
                          placeholder="Rate"
                          value={v.rate}
                          onChange={e => updateVariant(i, { rate: e.target.value })}
                        />
                        {v.pricing_type === 'per_unit' && (
                          <input
                            placeholder="Unit (e.g. bale)"
                            value={v.unit_label}
                            onChange={e => updateVariant(i, { unit_label: e.target.value })}
                          />
                        )}
                      </div>
                      <div className="lform-repeat-grid">
                        <input
                          inputMode="numeric"
                          placeholder="Min units (optional)"
                          value={v.min_units}
                          onChange={e => updateVariant(i, { min_units: e.target.value })}
                        />
                        <input
                          inputMode="numeric"
                          placeholder="Min charge (optional)"
                          value={v.min_charge}
                          onChange={e => updateVariant(i, { min_charge: e.target.value })}
                        />
                      </div>
                      <div className="lform-repeat-foot">
                        <span className="lform-repeat-preview">{variantDisplay(v)}</span>
                        <button type="button" className="lform-repeat-remove" onClick={() => removeVariant(i)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="lform-add" onClick={addVariant}>+ Add a rate option</button>
                </div>

                {/* Terms */}
                <div className="lform-field">
                  <label htmlFor="lf-terms">Terms</label>
                  <textarea
                    id="lf-terms"
                    value={pricingTerms}
                    onChange={e => setPricingTerms(e.target.value)}
                    rows={3}
                    placeholder="Anything else about pricing — deposits, cancellation, what's not included."
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="lform-pricing-placeholder">
          <h2>Pricing</h2>
          <p className="muted">Pick a listing type to set pricing.</p>
        </section>
      )}

      {/* Listing card (B3) — optional polish */}
      <section className="lform-pricing">
        <h2>Listing card <span className="optional">(optional)</span></h2>
        <p className="muted">How your listing appears on the browse cards. Optional — leave blank for a plain card.</p>

        <div className="lform-field">
          <label htmlFor="lf-headline">Tagline / card headline</label>
          <input
            id="lf-headline"
            value={cardHeadline}
            onChange={e => setCardHeadline(e.target.value.slice(0, 55))}
            maxLength={55}
            placeholder="e.g. Too much garden, not enough time?"
          />
        </div>

        <div className="lform-field">
          <label htmlFor="lf-supporting">Supporting line</label>
          <input
            id="lf-supporting"
            value={cardSupportingText}
            onChange={e => setCardSupportingText(e.target.value.slice(0, 125))}
            maxLength={125}
            placeholder="Tell customers how you can help in one concise sentence"
          />
        </div>

        <div className="lform-field">
          <label>Card appearance</label>
          <div className="lseg">
            <button
              type="button"
              className={cardStyle === null ? 'lseg-btn active' : 'lseg-btn'}
              onClick={() => setCardStyle(null)}
            >
              None
            </button>
            {CARD_STYLES.map(s => (
              <button
                type="button"
                key={s.id}
                className={cardStyle === s.id ? 'lseg-btn active' : 'lseg-btn'}
                onClick={() => setCardStyle(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Availability (B3) — optional */}
      <section className="lform-pricing">
        <h2>Availability <span className="optional">(optional)</span></h2>
        <div className="lform-field">
          <div className="lseg">
            <button
              type="button"
              className={availMode === 'now' ? 'lseg-btn active' : 'lseg-btn'}
              onClick={() => { setAvailMode('now'); setAvailableFrom('') }}
            >
              Available now
            </button>
            <button
              type="button"
              className={availMode === 'from' ? 'lseg-btn active' : 'lseg-btn'}
              onClick={() => setAvailMode('from')}
            >
              From a date
            </button>
          </div>
          {availMode === 'from' && (
            <input
              type="date"
              value={availableFrom}
              onChange={e => setAvailableFrom(e.target.value)}
              style={{ marginTop: 10, maxWidth: 220 }}
            />
          )}
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      <div className="lform-actions">
        <button type="button" className="lform-cancel" onClick={() => router.push('/listings')} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="lform-save" onClick={onSave} disabled={!canSave || busy}>
          {busy && <LoaderCircle className="spin" size={15} />}
          {mode === 'edit' ? 'Save changes' : 'Create listing'}
        </button>
      </div>
    </div>
  )
}
