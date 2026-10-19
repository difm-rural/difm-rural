import Link from 'next/link'
import { ArrowRight, CheckCircle2, Plus, Search, Leaf, MessageSquare, Bell, ListChecks } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { ACTIVE_JOBS, ACTIVE_BOOKINGS, notificationHref } from '@/lib/work'
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { supabase, user, profile } = await requireProvider()
  const [jobs, bookings, offers, notifications, listings] = await Promise.all([
    supabase.from('jobs').select('id,title,status').eq('requester_id', user.id).in('status', ACTIVE_JOBS),
    supabase.from('bookings').select('id,status,provider_id,requester_id,service:services(title,kind,pricing_type)').or('requester_id.eq.' + user.id + ',provider_id.eq.' + user.id).in('status', ACTIVE_BOOKINGS),
    supabase.from('bids').select('id,job_id,status').eq('provider_id', user.id).in('status', ['pending','accepted']),
    supabase.from('notifications').select('id,type,body,metadata,created_at').eq('user_id', user.id).eq('read',false).order('created_at',{ascending:false}).limit(20),
    supabase.from('services').select('id,is_active,closed_at').eq('provider_id',user.id),
  ])
  const offerIds = [...new Set((offers.data || []).map(o => o.job_id))]
  const offerJobs = offerIds.length ? await supabase.from('jobs_public').select('id,title,status').in('id',offerIds) : {data:[],error:null}
  const openOfferJobs = new Set((offerJobs.data || []).filter(j => j.status === 'open').map(j => j.id))
  const activeOfferJobs = (offerJobs.data || []).filter(j => ['accepted','in_progress','awaiting_completion'].includes(j.status))
  const pendingOffers = (offers.data || []).filter(o => o.status === 'pending' && openOfferJobs.has(o.job_id)).length
  const jobsDoing = activeOfferJobs.filter(j => (offers.data || []).some(o => o.job_id === j.id && o.status === 'accepted')).length
  const hasError = [jobs, bookings, offers, notifications, listings, offerJobs].some(r => r.error)
  const workCount = (bookings.data || []).length + jobsDoing
  const total = (jobs.data || []).length + pendingOffers + workCount
  const name = profile?.full_name?.trim().split(/\s+/)[0] || 'there'
  const actions = [
    {title:'Post a job',text:'Describe the work and get local help',href:'/jobs/new',primary:true,icon:Plus},
    {title:'Browse listings',text:'Find rural listings near you',href:'/browse',primary:false,icon:Search},
    {title:'Find jobs',text:'Browse open rural work nearby',href:'/jobs',primary:true,icon:Search},
    {title:'Create a listing',text:'Advertise a service, grazing, gear, space or goods',href:'/listings/new',primary:false,icon:Plus},
  ]
  const pending = (bookings.data || []).filter(b => (b.provider_id === user.id && ['pending','cancellation_requested'].includes(b.status)) || (b.requester_id === user.id && b.status === 'quote_sent'))
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page home-page">
    <header className="home-heading"><div><p className="eyebrow">Rural Connections</p><h1>What needs doing?</h1><p className="muted">{hasError ? 'Good to see you, ' + name : total ? total + ' active item' + (total === 1 ? '' : 's') + ' on the go' : 'Good to see you, ' + name}</p></div><LiveRefresh /></header>
    <div className="home-actions">{actions.map(a => <Link key={a.title} href={a.href} className={'home-action ' + (a.primary ? 'primary' : '')}><a.icon size={22}/><strong>{a.title}</strong><span>{a.text}</span><ArrowRight size={18} className="home-action-arrow"/></Link>)}</div>
    {hasError && <div className="home-load-error" role="alert">Some activity could not be loaded. Check your connection and use Refresh to try again.</div>}
    <div className="home-columns"><div>
      <section className="card home-attention"><div className="card-head"><h2>Needs attention</h2><Link href="/activity" className="card-link">View activity <ArrowRight size={14}/></Link></div>
        {!notifications.error && !bookings.error && !pending.length && !notifications.data?.length ? <p className="home-clear"><CheckCircle2 size={20}/> All caught up — nothing waiting on you.</p> : <ul className="list">
          {pending.slice(0,4).map(b => { const service = b.service as unknown as {title?:string;pricing_type?:string} | null;return <li key={b.id}><Link className="row" href={'/activity#booking-' + b.id}><Bell size={20}/><span className="row-main"><strong>{service?.title || 'Booking request'}</strong><span className="row-sub">Waiting on you</span><span className="row-snippet">{b.status === 'pending' ? service?.pricing_type === 'quote_required' ? 'Send a quote or decline the request' : 'Confirm or decline the booking request' : b.status === 'quote_sent' ? 'Review and accept the quote' : 'Respond to the cancellation request'}</span></span><ArrowRight size={16}/></Link></li>})}
          {(notifications.data || []).filter(n => n.type === 'new_message' || !pending.some(b => b.id === n.metadata?.booking_id)).slice(0,5).map(n => <li key={n.id}><Link className="row" href={notificationHref(n)}><MessageSquare size={20}/><span className="row-main"><strong>{n.body}</strong><span className="row-sub">{new Date(n.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}</span></span><ArrowRight size={16}/></Link></li>)}
        </ul>}
      </section>
      <section className="home-activity"><h2>Your activity</h2><div className="home-stats">{[{label:'Active jobs posted',count:jobs.error ? null : jobs.data?.length || 0},{label:'Offers on open jobs',count:offers.error || offerJobs.error ? null : pendingOffers},{label:'Work & requests',count:bookings.error || offerJobs.error ? null : workCount}].map(t => <Link href="/activity" className="home-stat" key={t.label}><strong>{t.count ?? '—'}</strong><span>{t.label}</span></Link>)}</div>
        {!hasError && total === 0 && <div className="home-empty"><Leaf size={24}/><h3>No active work yet</h3><p>Post a job or browse listings to get started.</p></div>}
      </section>
    </div><aside className="home-aside">
      <Link href="/enquiries" className="card home-quick"><MessageSquare size={22}/><span><strong>Messages</strong><small>Read and reply to listing enquiries</small></span><ArrowRight size={17}/></Link>
      <Link href="/listings" className="card home-quick"><ListChecks size={22}/><span><strong>My listings</strong><small>{listings.error ? 'Manage your listings' : (listings.data || []).filter(s => s.is_active && !s.closed_at).length + ' live · Manage live, paused and closed listings'}</small></span><ArrowRight size={17}/></Link>
      <div className="home-explainer"><h3>Jobs & listings</h3><p><strong>Jobs</strong> are work you need done. Local people can send you an offer.</p><p><strong>Listings</strong> advertise services, grazing, hire and local goods.</p></div>
    </aside></div>
  </section></AppShell>
}
