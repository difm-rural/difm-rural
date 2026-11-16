import {formatDate as nzDate} from '@shared/formatting'
import {notificationBody} from '@shared/notificationBody'
import {notificationSide, sideTag} from '@shared/marketSide'
import {bookingNextMove,jobNextMove,type NextMove} from '@shared/nextMove'
import {rankOnTheGo} from '@shared/onTheGo'
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
    supabase.from('jobs').select('id,title,status,created_at,accepted_at,scheduled_date,date_from').eq('requester_id', user.id).in('status', ACTIVE_JOBS),
    supabase.from('bookings').select('id,status,provider_id,requester_id,created_at,quote_sent_at,quote_accepted_at,scheduled_date,service:services(title,kind,pricing_type)').or('requester_id.eq.' + user.id + ',provider_id.eq.' + user.id).in('status', ACTIVE_BOOKINGS),
    supabase.from('bids').select('id,job_id,status,created_at,payment_method,payment_sorted_at,payment_details_sent_at').eq('provider_id', user.id).in('status', ['pending','accepted']),
    supabase.from('notifications').select('id,type,body,metadata,created_at').eq('user_id', user.id).eq('read',false).order('created_at',{ascending:false}).limit(20),
    supabase.from('services').select('id,is_active,closed_at').eq('provider_id',user.id),
    loadSeasonalReminders(supabase),
  ])
  const offerIds = [...new Set((offers.data || []).map(o => o.job_id))]
  const offerJobs = offerIds.length ? await supabase.from('jobs_public').select('id,title,status,requester_id,created_at,accepted_at,scheduled_date,date_from').in('id',offerIds) : {data:[],error:null}
  // ─── On the go: everything in flight, by name, with whose turn it is ─────────
  // Offers on your own jobs (how many are waiting, and the accepted one's payment
  // state) and unanswered questions — what each job's next move depends on.
  const ownJobs = jobs.data || []
  const ownIds = ownJobs.map(j => j.id), ownOpenIds = ownJobs.filter(j => j.status === 'open').map(j => j.id)
  const [ownBids, ownQuestions] = await Promise.all([
    ownIds.length ? supabase.from('bids').select('job_id,provider_id,status,created_at,payment_method,payment_sorted_at,payment_details_sent_at').in('job_id', ownIds).in('status', ['pending','accepted']) : Promise.resolve({data:[],error:null}),
    ownOpenIds.length ? supabase.from('job_questions').select('job_id').in('job_id', ownOpenIds).is('answer', null) : Promise.resolve({data:[],error:null}),
  ])
  const pendingCount = new Map<string,number>(), questionCount = new Map<string,number>()
  const acceptedOnOwn = new Map<string,{provider_id:string;created_at:string|null;payment_method:string|null;payment_sorted_at:string|null;payment_details_sent_at:string|null}>()
  ;(ownBids.data || []).forEach(bid => { if (bid.status === 'accepted') acceptedOnOwn.set(bid.job_id, bid); else pendingCount.set(bid.job_id, (pendingCount.get(bid.job_id) || 0) + 1) })
  ;(ownQuestions.data || []).forEach(q => questionCount.set(q.job_id, (questionCount.get(q.job_id) || 0) + 1))
  const offerJobById = new Map((offerJobs.data || []).map(j => [j.id, j]))
  const nameIds = [...new Set([
    ...[...acceptedOnOwn.values()].map(bid => bid.provider_id),
    ...(offerJobs.data || []).map(j => j.requester_id),
    ...(bookings.data || []).map(b => b.provider_id === user.id ? b.requester_id : b.provider_id),
  ].filter(Boolean))]
  const people = nameIds.length ? await supabase.from('profiles_public').select('id,full_name').in('id', nameIds) : {data:[],error:null}
  const names = new Map((people.data || []).map(person => [person.id, person.full_name as string | null]))
  type GoItem = {key:string;side:'job'|'listing';own:boolean;title:string;href:string;next:NextMove;needsAction:boolean;updatedAt:unknown[]}
  const goItems: GoItem[] = []
  for (const job of ownJobs) {
    const accepted = acceptedOnOwn.get(job.id)
    const next = jobNextMove(job, 'requester', {otherName: accepted ? names.get(accepted.provider_id) : null, bidCount: pendingCount.get(job.id) || 0, unansweredQuestionCount: questionCount.get(job.id) || 0, paymentMethod: accepted?.payment_method, paymentSortedAt: accepted?.payment_sorted_at})
    if (next) goItems.push({key: 'job:' + job.id, side: 'job', own: true, title: job.title, href: '/jobs/' + job.id, next, needsAction: next.needsAction, updatedAt: [job.created_at, job.accepted_at, accepted?.payment_details_sent_at, accepted?.payment_sorted_at]})
  }
  for (const offer of offers.data || []) {
    const job = offerJobById.get(offer.job_id)
    // Pending offers on open jobs, and accepted offers you're doing.
    if (!job || !((offer.status === 'pending' && job.status === 'open') || (offer.status === 'accepted' && job.status === 'accepted'))) continue
    const next = jobNextMove(job, 'provider', {otherName: names.get(job.requester_id), hasPendingBid: offer.status === 'pending', paymentMethod: offer.payment_method, paymentSortedAt: offer.payment_sorted_at})
    if (next) goItems.push({key: 'offer:' + offer.id, side: 'job', own: false, title: job.title || 'Job', href: '/jobs/' + job.id, next, needsAction: next.needsAction, updatedAt: [offer.created_at, job.accepted_at, offer.payment_details_sent_at, offer.payment_sorted_at]})
  }
  for (const booking of bookings.data || []) {
    const providing = booking.provider_id === user.id
    const service = booking.service as unknown as {title?:string;kind?:string;pricing_type?:string} | null
    const next = bookingNextMove({...booking, service}, providing ? 'provider' : 'requester', {otherName: names.get(providing ? booking.requester_id : booking.provider_id)})
    if (next) goItems.push({key: 'booking:' + booking.id, side: 'listing', own: providing, title: service?.title || 'Booking', href: '/bookings/' + booking.id, next, needsAction: next.needsAction, updatedAt: [booking.created_at, booking.quote_sent_at, booking.quote_accepted_at]})
  }
  const onTheGo = rankOnTheGo(goItems)
  const hasError = [jobs, bookings, offers, notifications, listings, offerJobs, ownBids, ownQuestions].some(r => r.error)
  const total = onTheGo.total
  const name = profile?.full_name?.trim().split(/\s+/)[0] || 'there'
  const jobActions = [
    {title:'Post a job',text:'Get local help with a job',href:'/jobs/new',primary:true,icon:Plus},
    {title:'Find jobs',text:'Open work nearby',href:'/jobs',primary:false,icon:Search},
  ]
  const listingActions = [
    {title:'Find listings',text:'Listings near you',href:'/browse',primary:false,icon:Search},
    {title:'Create a listing',text:'Advertise what you offer',href:'/listings/new',primary:false,icon:Plus},
  ]
  const pending = (bookings.data || []).filter(b => (b.provider_id === user.id && ['pending','cancellation_requested'].includes(b.status)) || (b.requester_id === user.id && b.status === 'quote_sent'))
  const attention = (notifications.data || []).filter(n => !INFORMATIONAL_NOTICES.has(n.type) && (n.type === 'new_message' || !pending.some(b => b.id === n.metadata?.booking_id)))
  const caughtUp = !notifications.error && !bookings.error && !pending.length && !attention.length
  // Nothing on the go at all → show only the "No active work yet" empty state.
  const nothingAtAll = !hasError && total === 0 && !seasonal.length
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
      {!caughtUp && <section className="card home-attention"><div className="card-head"><h2>Needs attention</h2><Link href="/activity" className="card-link">View activity <ArrowRight size={14}/></Link><Link href="/notifications" className="card-link">All notifications</Link></div>
            <ul className="list">
              {pending.slice(0,4).map(b => { const service = b.service as unknown as {title?:string;pricing_type?:string} | null;const tag = b.provider_id === user.id ? 'YOUR LISTING' : 'LISTING';return <li key={b.id}><Link className="row" href={'/activity#booking-' + b.id}><span className="attention-icon listing"><Bell size={18}/></span><span className="row-main"><span className="side-tag listing">{tag}</span><strong>{service?.title || 'Booking request'}</strong><span className="row-sub">{bookingNextMove({status:b.status,service},b.provider_id === user.id ? 'provider' : 'requester')?.badge || 'Waiting on you'}</span><span className="row-snippet">{b.status === 'pending' ? service?.pricing_type === 'quote_required' ? 'Send a quote or decline the request' : 'Confirm or decline the booking request' : b.status === 'quote_sent' ? 'Review and accept the quote' : 'Respond to the cancellation request'}</span></span><ArrowRight size={16}/></Link></li>})}
              {attention.slice(0,5).map(n => { const side = notificationSide(n); const tag = sideTag(side, n);return <li key={n.id}><Link className="row" href={notificationHref(n)}>{side ? <span className={'attention-icon ' + side}><MessageSquare size={18}/></span> : <MessageSquare size={20}/>}<span className="row-main">{tag && <span className={'side-tag ' + side}>{tag}</span>}<strong>{notificationBody(n)}</strong><span className="row-sub">{nzDate(new Date(n.created_at))}</span></span><ArrowRight size={16}/></Link></li>})}
            </ul>
          </section>}
      {/* On the go — what's in flight, by name, with whose turn it is (replaces the count tiles) */}
      {onTheGo.total > 0 && <section className="card home-attention home-onthego"><div className="card-head"><h2>On the go</h2><Link href="/activity" className="card-link">View all ›</Link></div>
        <ul className="list">{onTheGo.shown.map(item => <li key={item.key}><Link className="row" href={item.href}><span className={'attention-icon ' + item.side}>{item.side === 'job' ? <Briefcase size={18}/> : <Tag size={18}/>}</span><span className="row-main"><span className={'side-tag ' + item.side}>{(item.own ? 'YOUR ' : '') + (item.side === 'job' ? 'JOB' : 'LISTING')}</span><strong>{item.title}</strong><span className={'work-badge' + (item.next.badgeTone === 'attention' ? ' attention' : '')}>{item.next.badge}</span></span><ArrowRight size={16}/></Link></li>)}</ul>
        {onTheGo.more > 0 && <p className="muted home-onthego-more">+{onTheGo.more} more in Activity</p>}
      </section>}
      {caughtUp && onTheGo.total === 0 && !nothingAtAll && <Link href="/activity" className="card home-status"><CheckCircle2 size={20}/><span className="home-status-text"><strong>All caught up</strong></span><span className="home-status-link">Activity ›</span></Link>}
      {nothingAtAll && <div className="home-empty"><Leaf size={24}/><h3>No active work yet</h3><p>Post a job or browse listings to get started.</p></div>}
      <SeasonalReminders campaigns={seasonal}/>
    </div><aside className="home-aside">
      <Link href="/connections" className="card home-quick"><UsersRound size={22}/><span><strong>Connections</strong><small>People you’ve worked with · Job invitations</small></span><ArrowRight size={17}/></Link>
      <Link href="/listings" className="card home-quick"><ListChecks size={22}/><span><strong>My listings</strong><small>{listings.error ? 'Manage your listings' : (listings.data || []).filter(s => s.is_active && !s.closed_at).length + ' live · Manage live, paused and closed listings'}</small></span><ArrowRight size={17}/></Link>
      <div className="home-explainer"><h3>Jobs & listings</h3><p><strong>Jobs</strong> are work you need done. Local people can send you an offer.</p><p><strong>Listings</strong> advertise services, grazing, hire and local goods.</p></div>
    </aside></div>
  </section></AppShell>
}
