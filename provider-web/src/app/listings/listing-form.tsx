'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import {
  LISTING_KINDS, KIND_PRICING, KIND_PRICING_DEFAULTS,
  PAYMENT_OPTIONS, MATERIALS_OPTIONS,
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
}

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
  }

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

          {/* B2b advanced levers slot in here */}
          <section className="lform-pricing-placeholder">
            <h2>More pricing options</h2>
            <p className="muted">Add-ons, rate variants, terms and a minimum charge are added in the next step (B2b).</p>
          </section>
        </section>
      ) : (
        <section className="lform-pricing-placeholder">
          <h2>Pricing</h2>
          <p className="muted">Pick a listing type to set pricing.</p>
        </section>
      )}

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
