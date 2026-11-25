'use client'

import {useEffect, useState, type Dispatch, type FormEvent, type SetStateAction} from 'react'
import {CalendarClock} from 'lucide-react'
import {availabilityDraft, availabilityPatch, AVAILABILITY_MESSAGE_LIMIT, LEAD_TIME_OPTIONS, listingAvailability, LISTING_AVAILABILITY_COLUMNS, LISTING_AVAILABILITY_STATUSES, type ListingAvailability} from '@shared/listingAvailability'
import {createClient} from '@/lib/supabase/client'

export function ManageAvailability({listing}: {listing: ListingAvailability & {id: string; title: string | null}}) {
  const [saved, setSaved] = useState<ListingAvailability | null>(null)
  const current = saved ?? listing
  const [draft, setDraft] = useState(() => availabilityDraft(listing))
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const {status, lead, updated} = listingAvailability(current)
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(''), 3500)
    return () => clearTimeout(timer)
  }, [feedback])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const patch = availabilityPatch(draft, current)
      const client = createClient()
      const {data, error: saveError} = await client.from('services').update(patch)
        .eq('id', listing.id).eq('availability_enabled', true).select(LISTING_AVAILABILITY_COLUMNS).single()
      if (saveError) throw saveError
      setSaved({...listing, ...data})
      setOpen(false)
      setFeedback('Availability saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save availability. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="manage-availability">
    <p>{[status, lead, updated].filter(Boolean).join(' · ')}</p>
    <button type="button" className="lform-cancel" aria-expanded={open}
      aria-label={'Manage availability: ' + (listing.title || 'Untitled listing')}
      onClick={() => {setDraft(availabilityDraft(current)); setOpen(!open); setFeedback(''); setError('')}}
      disabled={saving}><CalendarClock size={16} aria-hidden="true" /> Manage availability</button>
    {feedback && <p className="status-banner" role="status">{feedback}</p>}
    {open && <form onSubmit={save}>
      <fieldset disabled={saving}>
        <legend>Availability and lead time</legend>
        <ListingAvailabilityFields draft={draft} setDraft={setDraft} />
        {error && <p role="alert">{error}</p>}
        <div className="manage-actions-row">
          <button type="submit" className="lform-save">{saving ? 'Saving availability…' : 'Save availability'}</button>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </fieldset>
    </form>}
  </div>
}

type Draft = ReturnType<typeof availabilityDraft>

export function ListingAvailabilityFields({draft, setDraft}: {draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => ({...previous, [key]: value}))
  return <div className="listing-availability-fields">
        <label>Availability status<select value={draft.status} onChange={event => set('status', event.target.value as typeof draft.status)}>
          {Object.entries(LISTING_AVAILABILITY_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {draft.status === 'paused' && <p>The listing stays visible. Existing requests and enquiries can continue.</p>}
        <label>Estimated lead time<select value={draft.type} onChange={event => set('type', event.target.value as typeof draft.type)}>
          {Object.entries(LEAD_TIME_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {(draft.type === 'fixed_days' || draft.type === 'range_days') &&
          <label>{draft.type === 'fixed_days' ? 'Number of days' : 'Minimum days'}<input required type="number" min="1" step="1" value={draft.min} onChange={event => set('min', event.target.value)} /></label>}
        {draft.type === 'range_days' && <label>Maximum days<input required type="number" min="1" step="1" value={draft.max} onChange={event => set('max', event.target.value)} /></label>}
        {draft.type === 'earliest_date' && <label>Earliest available date<input required type="date" value={draft.date} onChange={event => set('date', event.target.value)} /></label>}
        <label>Public message (optional)<textarea rows={2} maxLength={AVAILABILITY_MESSAGE_LIMIT} value={draft.message} onChange={event => set('message', event.target.value)} /></label>
        <small>{Array.from(draft.message).length} / {AVAILABILITY_MESSAGE_LIMIT}</small>
  </div>
}
