import {formatDate as nzDate} from '@shared/formatting'
import {notificationBody} from '@shared/notificationBody'
import {notificationSide, sideTag} from '@shared/marketSide'
import {SeasonalReminders} from '@/components/seasonal-reminders'
import {loadSeasonalReminders} from '@/lib/seasonal-reminders'
import Link from '@/components/navigation-link'
import { ArrowRight, CheckCircle2, Plus, Search, Leaf, MessageSquare, Bell, ListChecks, UsersRound, Briefcase, Tag } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { ACTIVE_JOBS, ACTIVE_BOOKINGS, notificationHref } from '@/lib/work'
export const dynamic = 'force-dynamic'

// "Needs attention" lists only things the user should act on. These types are
// purely informational (an outcome, not a to-do) — they stay in Notifications
// but never surface here. Actionable types (shown): new_message, new_bid,
// new_booking, new_question, service_quote_sent, booking_cancellation_requested,
// booking_completed, job_completed, work_completion_due, availability_check.
const INFORMATIONAL_NOTICES = new Set([
  'review_received', 'job_cancelled', 'booking_confirmed', 'booking_declined',
  'booking_cancelled', 'service_booking_withdrawn', 'service_quote_accepted',
  'bid_accepted', 'bid_rejected', 'bid_placed', 'question_answered',
  'opportunity_match', 'opportunity_digest', 'saved_interest_match', 'zero_matches',
])

export default async function HomePage() {
  const { supabase, user, profile } = await requireProvider()
  const [jobs, bookings, offers, notifications, listings, seasonal] = await Promise.all([
    supabase.from('jobs').select('id,title,status').eq('requester_id', user.id).in('status', ACTIVE_JOBS),
    supabase.from('bookings').select('id,status,provider_id,requester_id,service:services(title,kind,pricing_type)').or('requester_id.eq.' + user.id + ',provider_id.eq.' + user.id).in('status', ACTIVE_BOOKINGS),
    supabase.from('bids').select('id,job_id,status').eq('provider_id', user.id).in('status', ['pending','accepted']),
    supabase.from('notifications').select('id,type,body,metadata,created_at').eq('user_id', user.id).eq('read',false).order('created_at',{ascending:false}).limit(20),
    supabase.from('services').select('id,is_active,closed_at').eq('provider_id',user.id),
    loadSeasonalReminders(supabase),
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
  const jobActions = [
    {title:'Post a job',text:'Describe the work and get local help',href:'/jobs/new',primary:true,icon:Plus},
    {title:'Find jobs',text:'Browse open rural work nearby',href:'/jobs',primary:false,icon:Search},
  ]
  const listingActions = [
    {title:'Find listings',text:'Services, grazing, gear and goods near you',href:'/browse',primary:false,icon:Search},
    {title:'Create a listing',text:'Advertise a service, grazing, gear, space or goods',href:'/listings/new',primary:false,icon:Plus},
  ]
  const pending = (bookings.data || []).filter(b => (b.provider_id === user.id && ['pending','cancellation_requested'].includes(b.status)) || (b.requester_id === user.id && b.status === 'quote_sent'))
  const attention = (notifications.data || []).filter(n => !INFORMATIONAL_NOTICES.has(n.type) && (n.type === 'new_message' || !pending.some(b => b.id === n.metadata?.booking_id)))
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page home-page">
    <header className="home-heading"><div><h1>What needs doing?</h1><p className="muted">{hasError ? 'Good to see you, ' + name : total ? total + ' active item' + (total === 1 ? '' : 's') + ' on the go' : 'Good to see you, ' + name}</p></div><LiveRefresh /></header>
    {(!profile.full_name?.trim() || !profile.region?.trim()) && <section className="card account-form-section"><h2>Welcome to Rural Connections</h2><p>Add your public name and town or region so people know who they are arranging work with.</p><Link href="/setup" className="card-link">Finish your profile →</Link><p className="muted">You can explore first and return here later.</p></section>}
    <div className="home-groups">
      <section className="home-group job">
        <header className="home-group-head"><span className="home-group-icon"><Briefcase size={15}/></span><h2>Jobs · work someone needs done</h2></header>
        <div className="home-actions">{jobActions.map(a => <Link key={a.title} href={a.href} className={'home-action ' + (a.primary ? 'primary' : '')}><a.icon size={22}/><strong>{a.title}</strong><span>{a.text}</span><ArrowRight size={18} className="home-action-arrow"/></Link>)}</div>
      </section>
      <section className="home-group listing">
        <header className="home-group-head"><span className="home-group-icon"><Tag size={15}/></span><h2>Listings · what locals are offering</h2></header>
        <div className="home-actions">{listingActions.map(a => <Link key={a.title} href={a.href} className={'home-action ' + (a.primary ? 'primary' : '')}><a.icon size={22}/><strong>{a.title}</strong><span>{a.text}</span><ArrowRight size={18} className="home-action-arrow"/></Link>)}</div>
      </section>
    </div>
    {hasError && <div className="home-load-error" role="alert">Some activity could not be loaded. Check your connection and use Refresh to try again.</div>}
    <div className="home-columns"><div>
      <section className="card home-attention"><div className="card-head"><h2>Needs attention</h2><Link href="/activity" className="card-link">View activity <ArrowRight size={14}/></Link><Link href="/notifications" className="card-link">All notifications</Link></div>
        {!notifications.error && !bookings.error && !pending.length && !attention.length ? <p className="home-clear"><CheckCircle2 size={20}/> All caught up — nothing waiting on you.</p> : <ul className="list">
          {pending.slice(0,4).map(b => { const service = b.service as unknown as {title?:string;pricing_type?:string} | null;const tag = b.provider_id === user.id ? 'YOUR LISTING' : 'LISTING';return <li key={b.id}><Link className="row" href={'/activity#booking-' + b.id}><span className="attention-icon listing"><Bell size={18}/></span><span className="row-main"><span className="side-tag listing">{tag}</span><strong>{service?.title || 'Booking request'}</strong><span className="row-sub">Waiting on you</span><span className="row-snippet">{b.status === 'pending' ? service?.pricing_type === 'quote_required' ? 'Send a quote or decline the request' : 'Confirm or decline the booking request' : b.status === 'quote_sent' ? 'Review and accept the quote' : 'Respond to the cancellation request'}</span></span><ArrowRight size={16}/></Link></li>})}
          {attention.slice(0,5).map(n => { const side = notificationSide(n); const tag = sideTag(side, n);return <li key={n.id}><Link className="row" href={notificationHref(n)}>{side ? <span className={'attention-icon ' + side}><MessageSquare size={18}/></span> : <MessageSquare size={20}/>}<span className="row-main">{tag && <span className={'side-tag ' + side}>{tag}</span>}<strong>{notificationBody(n)}</strong><span className="row-sub">{nzDate(new Date(n.created_at))}</span></span><ArrowRight size={16}/></Link></li>})}
        </ul>}
      </section>
      <section className="home-activity"><h2>Your activity</h2>{(hasError || total > 0) && <div className="home-stats">{[{label:'Active jobs posted',count:jobs.error ? null : jobs.data?.length || 0},{label:'Offers on open jobs',count:offers.error || offerJobs.error ? null : pendingOffers},{label:'Work & requests',count:bookings.error || offerJobs.error ? null : workCount}].map(t => <Link href="/activity" className="home-stat" key={t.label}><strong>{t.count ?? '—'}</strong><span>{t.label}</span></Link>)}</div>}
        {!hasError && total === 0 && <div className="home-empty"><Leaf size={24}/><h3>No active work yet</h3><p>Post a job or browse listings to get started.</p></div>}
      </section>
      <SeasonalReminders campaigns={seasonal}/>
    </div><aside className="home-aside">
      <Link href="/connections" className="card home-quick"><UsersRound size={22}/><span><strong>Connections</strong><small>People you’ve worked with · Job invitations</small></span><ArrowRight size={17}/></Link>
      <Link href="/listings" className="card home-quick"><ListChecks size={22}/><span><strong>My listings</strong><small>{listings.error ? 'Manage your listings' : (listings.data || []).filter(s => s.is_active && !s.closed_at).length + ' live · Manage live, paused and closed listings'}</small></span><ArrowRight size={17}/></Link>
      <div className="home-explainer"><h3>Jobs & listings</h3><p><strong>Jobs</strong> are work you need done. Local people can send you an offer.</p><p><strong>Listings</strong> advertise services, grazing, hire and local goods.</p></div>
    </aside></div>
  </section></AppShell>
}
