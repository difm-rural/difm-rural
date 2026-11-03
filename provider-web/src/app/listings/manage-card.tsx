'use client'

import { useState } from 'react'
import Link from '@/components/navigation-link'
import { useRouter } from 'next/navigation'
import { Eye, LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { KIND_ENQUIRY,formatRate } from '@shared/listingPricing'
import { createClient } from '@/lib/supabase/client'
import { ListingCard, type CardStyle } from './listing-card'

export type Listing = {
  id: string
  title: string | null
  kind: string | null
  pricing_type: string | null
  rate: number | null
  unit_label: string | null
  min_charge?: number | null
  is_active: boolean | null
  closed_at: string | null
  close_reason: string | null
  photos: string[] | null
  card_headline: string | null
  card_supporting_text: string | null
  card_style: string | null
  category: string | null
  location_name: string | null
}

const KIND_LABEL: Record<string, string> = {
  service: 'Service', grazing: 'Grazing', hire: 'Hire', lease: 'Lease', for_sale: 'For sale',
}
// Close action label + stored reason, per enquiry kind.
const CLOSE: Record<string, { label: string; reason: string }> = {
  for_sale: { label: 'Mark sold', reason: 'sold' },
  grazing: { label: 'Mark taken', reason: 'taken' },
  lease: { label: 'Mark filled', reason: 'filled' },
}

function priceSummary(s: Listing): string {
  if(s.rate==null)return 'Quote required'
  return formatRate(s.pricing_type||'',s.rate,s.unit_label,s.min_charge)
}

export function ManageCard({ s }: { s: Listing }) {
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const closed = !!s.closed_at
  const canClose = !closed && !!s.kind && KIND_ENQUIRY.includes(s.kind as never)

  async function run(fn: () => Promise<{ error: unknown }>) {
    setBusy(true); setError('')
    const { error: e } = await fn()
    setBusy(false)
    if (e) { setError('Couldn’t update — retry.'); return }
    router.refresh()
  }

  const pauseResume = () => run(async () => supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id))
  const markClosed = () => {
    const c = CLOSE[s.kind as string]
    if (!c) return
    return run(async () => supabase.from('services').update({ close_reason: c.reason, closed_at: new Date().toISOString() }).eq('id', s.id))
  }
  const reopen = () => run(async () => supabase.from('services').update({ close_reason: null, closed_at: null }).eq('id', s.id))

  async function onDelete() {
    setBusy(true); setError('')
    const { data: bk, error: bkErr } = await supabase.from('bookings').select('id').eq('service_id', s.id).limit(1)
    if (bkErr) { setBusy(false); setError('Couldn’t check bookings — retry.'); return }
    if (bk && bk.length > 0) { setBusy(false); setError('Has booking history — pause instead of deleting.'); return }
    if (!window.confirm(`Delete “${s.title ?? 'this listing'}”? This cannot be undone.`)) { setBusy(false); return }
    const { error: e } = await supabase.from('services').delete().eq('id', s.id)
    setBusy(false)
    if (e) { setError('Couldn’t delete — retry.'); return }
    router.refresh()
  }

  const badge: { label: string; tone: 'live' | 'paused' | 'closed' } = closed
    ? { label: (s.close_reason ?? 'closed').toUpperCase(), tone: 'closed' }
    : s.is_active
      ? { label: 'Advertising live', tone: 'live' }
      : { label: 'Advertising paused', tone: 'paused' }

  return (
    <ListingCard
      href={`/listings/${s.id}`}
      data={{
        title: s.title,
        photoUrl: s.photos?.[0] ?? null,
        category: s.category,
        cardHeadline: s.card_headline,
        cardSupporting: s.card_supporting_text,
        cardStyle: s.card_style as CardStyle,
        priceLabel: priceSummary(s),
        kindLabel: KIND_LABEL[s.kind ?? ''] ?? (s.kind ?? undefined),
        badge,
      }}
      footer={
        <div className={closed ? 'manage-actions closed' : 'manage-actions'}>
          {error && <span className="row-err">{error}</span>}
          <div className="manage-actions-row">
            <Link href={`/listings/${s.id}`} className="manage-view" aria-label={'View listing: '+(s.title||'Untitled listing')}><Eye size={15} aria-hidden="true"/> View listing</Link>
            {busy && <LoaderCircle className="spin" size={15} aria-hidden="true"/>}
            <button type="button" onClick={pauseResume} disabled={busy} aria-label={(s.is_active?'Pause':'Resume')+' listing: '+(s.title||'Untitled listing')}>{s.is_active ? 'Pause' : 'Resume'}</button>
            {canClose && <button type="button" onClick={markClosed} disabled={busy} aria-label={CLOSE[s.kind as string].label+': '+(s.title||'Untitled listing')}>{CLOSE[s.kind as string].label}</button>}
            {closed && <button type="button" onClick={reopen} disabled={busy} aria-label={'Reopen listing: '+(s.title||'Untitled listing')}>Reopen</button>}
            <Link href={`/listings/${s.id}/edit`} className="manage-view" aria-label={'Edit listing: '+(s.title||'Untitled listing')}><Pencil size={15} aria-hidden="true"/> Edit</Link>
            <button type="button" onClick={onDelete} disabled={busy} className="manage-delete" aria-label={'Delete listing: '+(s.title||'Untitled listing')}><Trash2 size={15} aria-hidden="true"/> Delete</button>
          </div>
        </div>
      }
    />
  )
}
