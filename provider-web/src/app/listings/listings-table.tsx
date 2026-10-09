'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { KIND_ENQUIRY } from '@shared/listingPricing'
import { createClient } from '@/lib/supabase/client'

export type Listing = {
  id: string
  title: string | null
  kind: string | null
  pricing_type: string | null
  rate: number | null
  unit_label: string | null
  is_active: boolean | null
  closed_at: string | null
  close_reason: string | null
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
  if (s.pricing_type === 'quote_required' || s.rate == null) return 'Quote'
  if (s.pricing_type === 'hourly') return `$${s.rate}/hr`
  if (s.pricing_type === 'day_rate') return `$${s.rate}/day`
  if (s.pricing_type === 'per_unit') return `$${s.rate}/${s.unit_label || 'unit'}`
  return `$${s.rate}`
}

function ListingRow({ s }: { s: Listing }) {
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

  return (
    <tr className={closed ? 'listing-row closed' : 'listing-row'}>
      <td>
        <strong>{s.title ?? 'Untitled listing'}</strong>
        {error && <span className="row-err">{error}</span>}
      </td>
      <td><span className="kind-tag">{KIND_LABEL[s.kind ?? ''] ?? (s.kind ?? '—')}</span></td>
      <td>{priceSummary(s)}</td>
      <td>
        {closed
          ? <span className="badge closed">{(s.close_reason ?? 'closed').toUpperCase()}</span>
          : s.is_active
            ? <span className="badge live">Advertising live</span>
            : <span className="badge paused">Advertising paused</span>}
      </td>
      <td className="actions">
        {busy && <LoaderCircle className="spin" size={15} />}
        <button onClick={pauseResume} disabled={busy}>{s.is_active ? 'Pause' : 'Resume'}</button>
        {canClose && <button onClick={markClosed} disabled={busy}>{CLOSE[s.kind as string].label}</button>}
        {closed && <button onClick={reopen} disabled={busy}>Reopen</button>}
        <Link href={`/listings/${s.id}/edit`} className="icon-btn" aria-label="Edit"><Pencil size={15} /></Link>
        <button onClick={onDelete} disabled={busy} className="icon-btn danger" aria-label="Delete"><Trash2 size={15} /></button>
      </td>
    </tr>
  )
}

export function ListingsTable({ listings }: { listings: Listing[] }) {
  if (listings.length === 0) {
    return <p className="empty">No listings yet. Create one in the Rural Connections app.</p>
  }
  return (
    <div className="listing-table-wrap">
      <table className="listing-table">
        <thead>
          <tr><th>Listing</th><th>Kind</th><th>Price</th><th>Status</th><th aria-label="Actions" /></tr>
        </thead>
        <tbody>
          {listings.map(s => <ListingRow key={s.id} s={s} />)}
        </tbody>
      </table>
    </div>
  )
}
