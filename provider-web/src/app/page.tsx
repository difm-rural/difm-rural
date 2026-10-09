import Link from 'next/link'
import { ArrowRight, CalendarClock, Gavel, Inbox, ListChecks, MessagesSquare } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'

export const dynamic = 'force-dynamic'

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}
function money(b: { total_amount: number | null; quote_amount: number | null }): string {
  const a = b.total_amount ?? b.quote_amount
  return a != null ? `$${a}` : 'Quote'
}

type Msg = { id: string; service_id: string; sender_id: string; receiver_id: string; content: string | null; created_at: string }

export default async function DashboardPage() {
  const { supabase, user, profile } = await requireProvider()
  const me = user.id

  // My listings (RLS also exposes everyone's active services, so filter to mine).
  const { data: svc } = await supabase
    .from('services')
    .select('id, title, is_active, closed_at')
    .eq('provider_id', me)
  const services = svc ?? []
  const serviceIds = services.map(s => s.id)
  const titleById = new Map(services.map(s => [s.id, s.title as string]))
  const activeCount = services.filter(s => s.is_active && !s.closed_at).length
  const pausedCount = services.filter(s => !s.is_active && !s.closed_at).length
  const closedCount = services.filter(s => !!s.closed_at).length

  // 1. Enquiries awaiting my reply: listing-scoped messages (RLS = participant-scoped),
  //    on my listings, where the latest message in each (listing, counterpart) thread is NOT mine.
  const enquiries: { id: string; service_id: string; counterpart: string; content: string | null; created_at: string }[] = []
  if (serviceIds.length) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, service_id, sender_id, receiver_id, content, created_at')
      .not('service_id', 'is', null)
      .in('service_id', serviceIds)
      .order('created_at', { ascending: false })
    const seen = new Set<string>()
    for (const m of (msgs ?? []) as Msg[]) {
      const counterpart = m.sender_id === me ? m.receiver_id : m.sender_id
      const key = `${m.service_id}:${counterpart}`
      if (seen.has(key)) continue
      seen.add(key) // first seen per thread = latest (ordered desc)
      if (m.sender_id !== me) enquiries.push({ id: m.id, service_id: m.service_id, counterpart, content: m.content, created_at: m.created_at })
    }
  }

  // 2. Pending bookings on my services (RLS also returns bookings I made as requester → filter provider_id).
  const { data: bk } = await supabase
    .from('bookings')
    .select('id, service_id, requester_id, total_amount, quote_amount, scheduled_date, created_at')
    .eq('provider_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  const pendingBookings = bk ?? []

  // 3. My bids (RLS also returns bids on jobs I own → filter provider_id).
  const { data: bd } = await supabase
    .from('bids')
    .select('id, job_id, amount, status, created_at')
    .eq('provider_id', me)
    .order('created_at', { ascending: false })
    .limit(40)
  const bids = bd ?? []
  const acceptedBids = bids.filter(b => b.status === 'accepted')
  const pendingBids = bids.filter(b => b.status === 'pending')
  const rejectedBids = bids.filter(b => b.status === 'rejected')

  // Names (counterparts + requesters) via the public profile view; job titles via jobs_public.
  const peopleIds = [...new Set([...enquiries.map(e => e.counterpart), ...pendingBookings.map(b => b.requester_id)].filter(Boolean))]
  const nameById = new Map<string, string>()
  if (peopleIds.length) {
    const { data: profs } = await supabase.from('profiles_public').select('id, full_name').in('id', peopleIds)
    for (const p of profs ?? []) nameById.set(p.id, (p.full_name as string) ?? 'Someone')
  }
  const jobIds = [...new Set(bids.map(b => b.job_id).filter(Boolean))]
  const jobTitleById = new Map<string, string>()
  if (jobIds.length) {
    const { data: jobs } = await supabase.from('jobs_public').select('id, title').in('id', jobIds)
    for (const j of jobs ?? []) jobTitleById.set(j.id, (j.title as string) ?? 'a job')
  }

  const actionableTotal = enquiries.length + pendingBookings.length + acceptedBids.length

  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="page dash">
        <header className="dash-head">
          <div>
            <p className="eyebrow">Provider console</p>
            <h1>Waiting on you</h1>
          </div>
          <p className="muted dash-sub">
            {actionableTotal > 0 ? `${actionableTotal} item${actionableTotal === 1 ? '' : 's'} need a response.` : 'Nothing needs a response right now.'}
          </p>
        </header>

        <div className="dash-grid">
          {/* 1. Enquiries awaiting reply — headline */}
          <article className="card span-2">
            <div className="card-head">
              <h2><MessagesSquare size={17} /> Enquiries needing a reply</h2>
              <Link href="/enquiries" className="card-link">Open enquiries <ArrowRight size={14} /></Link>
            </div>
            {enquiries.length === 0 ? (
              <p className="empty"><Inbox size={16} /> You&apos;re all caught up.</p>
            ) : (
              <ul className="list">
                {enquiries.map(e => (
                  <li key={e.id}>
                    <Link href="/enquiries" className="row">
                      <span className="row-main">
                        <strong>{nameById.get(e.counterpart) ?? 'Someone'}</strong>
                        <span className="row-sub">{titleById.get(e.service_id) ?? 'a listing'}</span>
                        <span className="row-snippet">{(e.content ?? '').slice(0, 90)}</span>
                      </span>
                      <span className="row-meta">{timeAgo(e.created_at)}<ArrowRight size={14} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {/* 2. Pending bookings */}
          <article className="card">
            <div className="card-head">
              <h2><CalendarClock size={17} /> Pending bookings</h2>
            </div>
            {pendingBookings.length === 0 ? (
              <p className="empty">No bookings waiting.</p>
            ) : (
              <ul className="list">
                {pendingBookings.map(b => (
                  <li key={b.id}>
                    <span className="row">
                      <span className="row-main">
                        <strong>{titleById.get(b.service_id) ?? 'A service'}</strong>
                        <span className="row-sub">{nameById.get(b.requester_id) ?? 'A requester'} · {money(b)}</span>
                        {b.scheduled_date && <span className="row-snippet">{b.scheduled_date}</span>}
                      </span>
                      <span className="row-meta">{timeAgo(b.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {/* 3. Accepted bids — act-now */}
          <article className="card">
            <div className="card-head">
              <h2><Gavel size={17} /> Bids you won</h2>
            </div>
            {acceptedBids.length === 0 ? (
              <p className="empty">No accepted bids.</p>
            ) : (
              <ul className="list">
                {acceptedBids.map(b => (
                  <li key={b.id}>
                    <span className="row">
                      <span className="row-main">
                        <strong>{jobTitleById.get(b.job_id) ?? 'A job'}</strong>
                        <span className="row-sub">${b.amount} · accepted</span>
                      </span>
                      <span className="row-meta">{timeAgo(b.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(pendingBids.length > 0 || rejectedBids.length > 0) && (
              <p className="muted bids-foot">{pendingBids.length} awaiting · <span className="dim">{rejectedBids.length} not successful</span></p>
            )}
          </article>

          {/* 4. Listings summary */}
          <article className="card span-2 summary">
            <div className="card-head">
              <h2><ListChecks size={17} /> Your listings</h2>
              <Link href="/listings" className="card-link">Manage listings <ArrowRight size={14} /></Link>
            </div>
            <div className="stat-row">
              <div className="stat"><span className="stat-num">{activeCount}</span><span className="stat-label">Active</span></div>
              <div className="stat"><span className="stat-num">{pausedCount}</span><span className="stat-label">Paused</span></div>
              <div className="stat"><span className="stat-num">{closedCount}</span><span className="stat-label">Closed</span></div>
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  )
}
