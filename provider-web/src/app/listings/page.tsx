import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ManageCard, type Listing } from './manage-card'

export const dynamic = 'force-dynamic'

export default async function ListingsPage() {
  const { supabase, user, profile } = await requireProvider()

  // RLS also exposes everyone's active services, so filter to mine (incl. paused/closed).
  const { data } = await supabase
    .from('services')
    .select('id, title, kind, pricing_type, rate, unit_label, is_active, closed_at, close_reason, photos, card_headline, card_supporting_text, card_style, category, location_name')
    .eq('provider_id', user.id)
  const rows = (data ?? []) as Listing[]

  // Sort: live first, then paused, then closed (closed at the bottom).
  const rank = (s: Listing) => (s.closed_at ? 2 : s.is_active ? 0 : 1)
  rows.sort((a, b) => rank(a) - rank(b))

  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="page listings">
        <header className="dash-head">
          <div>
            <p className="eyebrow">Provider console</p>
            <h1>Listings</h1>
          </div>
          <div className="dash-head-aside">
            <p className="muted dash-sub">{rows.length} listing{rows.length === 1 ? '' : 's'}</p>
            <Link href="/listings/new" className="lform-save as-link"><Plus size={15} /> New listing</Link>
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="empty">
            No listings yet. <Link href="/listings/new" className="text-link">Create one</Link> or use the Rural Connections app.
          </p>
        ) : (
          <div className="manage-grid">
            {rows.map(s => <ManageCard key={s.id} s={s} />)}
          </div>
        )}
      </section>
    </AppShell>
  )
}
