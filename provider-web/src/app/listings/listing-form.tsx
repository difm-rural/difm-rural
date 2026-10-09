'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { LISTING_KINDS, type ListingKind } from '@shared/listingPricing'
import { LISTING_CATEGORIES } from '@shared/categories'
import { createClient } from '@/lib/supabase/client'

// B1 owns the non-pricing fields only. Pricing (pricing_type, rate, unit_label,
// minimum_units, min_charge, max_units, pricing_add_ons/terms/variants, payment_timing,
// materials) lands in B2 — see the placeholder <section> below. A NEW listing saved via
// B1 alone therefore has NO pricing (pricing_type/rate stay NULL, which the services
// CHECK/nullable columns permit); that's acceptable only because B2 ships before this does.

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

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const categoryOptions = kind ? LISTING_CATEGORIES[kind] : []

  // Mirror the RN create flow: changing kind (NEW only) clears a now-invalid category.
  function selectKind(k: ListingKind) {
    if (mode === 'edit') return // kind is locked on an existing listing
    setKind(k)
    setCategory('')
  }

  const canSave = !!kind && !!title.trim() && !!category && !!locationName.trim()

  async function onSave() {
    if (!canSave) return
    setBusy(true); setError('')

    // Only the fields B1 owns. EDIT does a PARTIAL update so pricing fields, closed_at
    // and close_reason are never clobbered; kind/direction are not editable here either.
    const trimmedTravel = travelRange.trim()
    const parsedTravel = trimmedTravel ? parseFloat(trimmedTravel) : null
    const fields = {
      title: title.trim(),
      category,
      description: description.trim() || null,
      location_name: locationName.trim(),
      travel_range_km: Number.isFinite(parsedTravel as number) ? parsedTravel : null,
    }

    if (mode === 'edit' && listing) {
      const { error: e } = await supabase
        .from('services')
        .update(fields)
        .eq('id', listing.id)
        .eq('provider_id', userId)
      setBusy(false)
      if (e) { setError('Couldn’t save — retry.'); return }
    } else {
      const { error: e } = await supabase.from('services').insert({
        provider_id: userId,
        kind,
        direction: 'offering',
        is_active: true,
        ...fields,
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

      {/* B2 pricing step slots in here */}
      <section className="lform-pricing-placeholder">
        <h2>Pricing</h2>
        <p className="muted">Pricing is set in the next step (B2). This listing has no pricing yet.</p>
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
