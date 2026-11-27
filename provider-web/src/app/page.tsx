import {bookingNextMove,jobNextMove,type NextMove} from '@shared/nextMove'
import {rankOnTheGo} from '@shared/onTheGo'
import {loadReviewPrompts} from '@shared/reviewPrompts'
import {DismissReview} from '@/components/dismiss-review'
import {HomeModes} from '@/components/home-modes'
import {homeCustomerCount,homeAttentionSummary,homePropertyEmpty} from '@shared/homeSummary'
import {HOME_MODES} from '@shared/homeMode'
import {loadPropertyNetwork,propertyNetworkHelpCount,propertyNetworkHomeLines} from '@shared/propertyNetwork'
import {SeasonalReminders} from '@/components/seasonal-reminders'
import {loadSeasonalReminders} from '@/lib/seasonal-reminders'
import Link from '@/components/navigation-link'
import { ArrowRight, Plus, Search, Leaf, ListChecks, UsersRound, Briefcase, Tag } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { ACTIVE_JOBS, ACTIVE_BOOKINGS } from '@/lib/work'
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { supabase, user, profile } = await requireProvider()
  const [jobs, bookings, offers, notifications, listings, seasonal, network, invitations, customerCount, reviewPrompts] = await Promise.all([
    supabase.from('jobs').select('id,title,status,created_at,accepted_at,scheduled_date,date_from').eq('requester_id', user.id).in('status', ACTIVE_JOBS),
    supabase.from('bookings').select('id,status,provider_id,requester_id,created_at,quote_sent_at,quote_accepted_at,scheduled_date,service:services_public(title,kind,pricing_type)').or('requester_id.eq.' + user.id + ',provider_id.eq.' + user.id).in('status', ACTIVE_BOOKINGS),
    supabase.from('bids').select('id,job_id,status,created_at,payment_method,payment_sorted_at,payment_details_sent_at').eq('provider_id', user.id).in('status', ['pending','accepted']),
    supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id', user.id).eq('read',false),
    supabase.from('services').select('id,is_active,closed_at').eq('provider_id',user.id),
    loadSeasonalReminders(supabase),
    loadPropertyNetwork(supabase,user.id).catch(()=>null),
    supabase.from('job_invites').select('id,job:jobs!inner(status)',{count:'exact',head:true})
      .eq('provider_id',user.id).in('status',['pending','seen']).eq('job.status','open'),
    homeCustomerCount(supabase,user.id),
    loadReviewPrompts(supabase,user.id).catch(()=>[]),
  ])
  const offerIds = [...new Set((offers.data || []).map(o => o.job_id))]
  const offerJobs = offerIds.length ? await supabase.from('jobs_public').select('id,title,status,requester_id,created_at,scheduled_date,date_from').in('id',offerIds) : {data:[],error:null}
  const acceptedOfferIds = new Set((offers.data || []).filter(offer => offer.status === 'accepted').map(offer => offer.job_id))
  const awardedJobIds = (offerJobs.data || []).filter(job => job.status === 'accepted' && acceptedOfferIds.has(job.id)).map(job => job.id)
  // ─── On the go: everything in flight, by name, with whose turn it is ─────────
  // Offers on your own jobs (how many are waiting, and the accepted one's payment
  // state) and unanswered questions — what each job's next move depends on.
  const ownJobs = jobs.data || []
  const ownIds = ownJobs.map(j => j.id), ownOpenIds = ownJobs.filter(j => j.status === 'open').map(j => j.id)
  const scheduledIds=[...new Set([...awardedJobIds,...ownJobs.filter(job=>job.status==='accepted').map(job=>job.id)])]
  const [ownBids, ownQuestions, awardTimes, schedules] = await Promise.all([
    ownIds.length ? supabase.from('bids').select('job_id,provider_id,status,created_at,payment_method,payment_sorted_at,payment_details_sent_at').in('job_id', ownIds).in('status', ['pending','accepted']) : Promise.resolve({data:[],error:null}),
    ownOpenIds.length ? supabase.from('job_questions').select('job_id').in('job_id', ownOpenIds).is('answer', null) : Promise.resolve({data:[],error:null}),
    // Keep all job display data on the masked view. Only the winning provider
    // needs the base job's acceptance timestamp for activity ordering.
    awardedJobIds.length ? supabase.from('bids').select('job_id,job:jobs(accepted_at)')
      .eq('provider_id', user.id).eq('status', 'accepted').in('job_id', awardedJobIds) : Promise.resolve({data:[],error:null}),
    scheduledIds.length ? supabase.from('work_schedules').select('job_id,arrival_start_at').in('job_id',scheduledIds) : Promise.resolve({data:[],error:null}),
  ])
  const arrivals=new Map((schedules.data||[]).map(row=>[row.job_id,row.arrival_start_at]))
  const confirmation=(id:string)=>schedules.error?{}:{hasArrival:!!arrivals.get(id),arrivalAt:arrivals.get(id)}
  const pendingCount = new Map<string,number>(), questionCount = new Map<string,number>()
  const acceptedOnOwn = new Map<string,{provider_id:string;created_at:string|null;payment_method:string|null;payment_sorted_at:string|null;payment_details_sent_at:string|null}>()
  ;(ownBids.data || []).forEach(bid => { if (bid.status === 'accepted') acceptedOnOwn.set(bid.job_id, bid); else pendingCount.set(bid.job_id, (pendingCount.get(bid.job_id) || 0) + 1) })
  ;(ownQuestions.data || []).forEach(q => questionCount.set(q.job_id, (questionCount.get(q.job_id) || 0) + 1))
  const offerJobById = new Map((offerJobs.data || []).map(j => [j.id, j]))
  const acceptedAtByJob = new Map((awardTimes.data || []).map(({job_id,job}) => [
    job_id, (Array.isArray(job) ? job[0] : job)?.accepted_at,
  ]))
  const nameIds = [...new Set([
    ...[...acceptedOnOwn.values()].map(bid => bid.provider_id),
    ...(offerJobs.data || []).map(j => j.requester_id),
    ...(bookings.data || []).map(b => b.provider_id === user.id ? b.requester_id : b.provider_id),
  ].filter(Boolean))]
  const people = nameIds.length ? await supabase.from('profiles_public').select('id,full_name').in('id', nameIds) : {data:[],error:null}
  const names = new Map((people.data || []).map(person => [person.id, person.full_name as string | null]))
  type GoItem = {review?:{kind:'job'|'booking';id:string};key:string;viewerRole:'requester'|'provider';pendingOffer?:boolean;arrivalAt?:string|null;side:'job'|'listing';own:boolean;title:string;href:string;next:NextMove;needsAction:boolean;updatedAt:unknown[]}
  const goItems: GoItem[] = []
  for (const job of ownJobs) {
    const accepted = acceptedOnOwn.get(job.id)
    const next = jobNextMove(job, 'requester', {...confirmation(job.id),otherName: accepted ? names.get(accepted.provider_id) : null, bidCount: pendingCount.get(job.id) || 0, unansweredQuestionCount: questionCount.get(job.id) || 0, paymentMethod: accepted?.payment_method, paymentSortedAt: accepted?.payment_sorted_at})
    if (next) goItems.push({viewerRole:'requester',key: 'job:' + job.id, side: 'job', own: true, title: job.title, href: '/jobs/' + job.id, next, needsAction: next.needsAction, updatedAt: [job.created_at, job.accepted_at, accepted?.payment_details_sent_at, accepted?.payment_sorted_at]})
  }
  for (const offer of offers.data || []) {
    const job = offerJobById.get(offer.job_id)
    // Pending offers on open jobs, and accepted offers you're doing.
    if (!job || !((offer.status === 'pending' && job.status === 'open') || (offer.status === 'accepted' && job.status === 'accepted'))) continue
    const next = jobNextMove(job, 'provider', {...confirmation(job.id),otherName: names.get(job.requester_id), hasPendingBid: offer.status === 'pending', paymentMethod: offer.payment_method, paymentSortedAt: offer.payment_sorted_at})
    if (next) goItems.push({viewerRole:'provider',pendingOffer:offer.status==='pending',arrivalAt:arrivals.get(job.id),key: 'offer:' + offer.id, side: 'job', own: false, title: job.title || 'Job', href: '/jobs/' + job.id, next, needsAction: next.needsAction, updatedAt: [offer.created_at, acceptedAtByJob.get(job.id), offer.payment_details_sent_at, offer.payment_sorted_at]})
  }
  for (const booking of bookings.data || []) {
    const providing = booking.provider_id === user.id
    const service = booking.service as unknown as {title?:string;kind?:string;pricing_type?:string} | null
    const next = bookingNextMove({...booking, service}, providing ? 'provider' : 'requester', {otherName: names.get(providing ? booking.requester_id : booking.provider_id)})
    if (next) goItems.push({viewerRole:providing?'provider':'requester',key: 'booking:' + booking.id, side: 'listing', own: providing, title: service?.title || 'Booking', href: '/bookings/' + booking.id, next, needsAction: next.needsAction, updatedAt: [booking.created_at, booking.quote_sent_at, booking.quote_accepted_at]})
  }
  // Completed work you haven't reviewed yet stays on Home until you do.
  for (const prompt of reviewPrompts) goItems.push({review:{kind:prompt.kind,id:prompt.id},viewerRole:prompt.viewerRole,key:prompt.key,side:prompt.kind==='job'?'job':'listing',own:prompt.viewerRole===(prompt.kind==='job'?'requester':'provider'),title:prompt.title,href:(prompt.kind==='job'?'/jobs/':'/bookings/')+prompt.id+'#reviews',next:prompt.next,needsAction:true,updatedAt:prompt.updatedAt})
  const hasError = [jobs, bookings, offers, notifications, listings, offerJobs, ownBids, ownQuestions, awardTimes, schedules, invitations].some(r => r.error)
  const networkLines=network?propertyNetworkHomeLines(network):[]
  const emptyState=homePropertyEmpty(propertyNetworkHelpCount(network))
  // The work-stage counts (offers / upcoming / active) were removed: On the go
  // already lists that work by name, and the counts overlapped. Invitations
  // keep a single line, since Home has no other way to them.
  const invitationCount=invitations.error?0:invitations.count||0
  function actions(work:boolean){
   const items=work?[
    {title:'Find work',text:'Browse available jobs.',href:'/jobs',icon:Search},
    {title:'My listings',text:'Manage or create listings',href:'/listings',icon:ListChecks},
   ]:[
    {title:'Post a job',text:'Get help with something that needs doing.',href:'/jobs/new',icon:Plus},
    {title:'Find local help',text:'Browse local providers and services.',href:'/browse',icon:Search},
   ]
   return <div className="home-actions">{items.map((item,index)=><Link key={item.href} href={item.href} className={'home-action'+(index===0?' primary':'')}><item.icon size={22}/><strong>{item.title}</strong><span>{item.text}</span><ArrowRight size={18} className="home-action-arrow"/></Link>)}</div>
  }
  function activity(role:'requester'|'provider'){
   // Review prompts live in Needs attention only; On the go is work still in flight.
   const onTheGo=rankOnTheGo(goItems.filter(item=>item.viewerRole===role&&!item.review))
   const activityUnavailable=[jobs,bookings,offers,offerJobs,ownBids,ownQuestions,awardTimes,schedules].some(result=>result.error)
   const attentionSummary=homeAttentionSummary(activityUnavailable?null:goItems.filter(item=>item.viewerRole===role),role==='provider'?invitations.count??null:0,notifications.count,
    role==='provider'?{label:'My Property',count:goItems.filter(item=>item.viewerRole==='requester'&&item.needsAction).length}:{label:'My Work',count:goItems.filter(item=>item.viewerRole==='provider'&&item.needsAction).length+(invitations.count||0)})
   const attention=attentionSummary.items
   return <>
      <p className="home-work-empty">{attentionSummary.text}</p>
      {attention.length>0 && <section className="card home-attention"><div className="card-head"><h2>Needs attention ({attention.length})</h2><Link href="/activity" className="card-link">View activity <ArrowRight size={14}/></Link></div>
        <ul className="list">{attention.slice(0,5).map(item=><li key={item.key}><Link className="row" href={item.href}>
          <span className={'attention-icon '+item.side}>{item.side==='job'?<Briefcase size={18}/>:<Tag size={18}/>}</span>
          <span className="row-main"><strong>{item.title}</strong><span className="row-sub">{item.next.label}</span><span className="row-snippet">{item.next.detail}</span><span className="card-link">{item.next.actionLabel || 'View details'} →</span></span><ArrowRight size={16}/>
        </Link>{item.review&&<DismissReview kind={item.review.kind} id={item.review.id} role={item.viewerRole} title={item.title}/>}</li>)}</ul>
      </section>}
      {/* On the go — what's in flight, by name, with whose turn it is (replaces the count tiles) */}
      {onTheGo.total > 0 && <section className="card home-attention home-onthego"><div className="card-head"><h2>On the go</h2><Link href="/activity" className="card-link">View all ›</Link></div>
        <ul className="list">{onTheGo.shown.map(item => <li key={item.key}><Link className="row" href={item.href}><span className={'attention-icon ' + item.side}>{item.side === 'job' ? <Briefcase size={18}/> : <Tag size={18}/>}</span><span className="row-main"><span className={'side-tag ' + item.side}>{(item.own ? 'YOUR ' : '') + (item.side === 'job' ? 'JOB' : 'LISTING')}</span><strong>{item.title}</strong><span className={'work-badge' + (item.next.badgeTone === 'attention' ? ' attention' : '')}>{item.next.badge}</span></span><ArrowRight size={16}/></Link></li>)}</ul>
        {onTheGo.more > 0 && <p className="muted home-onthego-more">+{onTheGo.more} more in Activity</p>}
      </section>}
      {role==='requester'&&attentionSummary.count===0&&onTheGo.total===0&&!hasError&&<div className="home-empty"><Leaf size={24}/><h3>{emptyState.title}</h3><p>{emptyState.body}</p></div>}
   </>
  }
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page home-page home-v2">
   {(!profile.full_name?.trim() || !profile.region?.trim()) && <section className="card account-form-section"><h2>Finish your profile</h2><p>Add your public name and town or region.</p><Link href="/setup" className="card-link">Finish your profile</Link></section>}
   {hasError&&<div className="home-load-error" role="alert">Some activity could not be loaded. Check your connection and use Refresh to try again.</div>}
   <HomeModes owner={user.id} attention={{property:goItems.filter(item=>item.viewerRole==='requester'&&item.needsAction).length,work:goItems.filter(item=>item.viewerRole==='provider'&&item.needsAction).length+(invitations.count||0)}} refresh={<LiveRefresh/>} property={<>
    <header className="home-heading"><div><h1>{HOME_MODES[0].heading}</h1><p className="muted">{HOME_MODES[0].subtitle}</p></div></header>
    {/* My Network stays in the sidebar; My People is a tab on My Network. */}
    {actions(false)}
    {activity('requester')}
    {/* Below the day-to-day work (not the main v0.1 feature); only once it has something in it. */}
    {networkLines.length>0&&<Link href="/property-network" className="home-network-line">
     <UsersRound size={22} aria-hidden="true"/><span><strong>My Property Network</strong>{networkLines.map(line=><span key={line}>{line}</span>)}</span>
     <ArrowRight size={18} aria-hidden="true"/>
    </Link>}
   </>} work={<>
    <header className="home-heading"><div><h1>{HOME_MODES[1].heading}</h1><p className="muted">{HOME_MODES[1].subtitle}</p></div></header>
    {invitationCount>0&&<p><Link href="/connections/invitations" className="card-link">{invitationCount} {invitationCount===1?'invitation':'invitations'} to review ›</Link></p>}
    {actions(true)}
    <div className="home-work-links">
     <Link href="/connections?view=customers" className="card home-quick"><UsersRound size={22}/><span><strong>My Customers</strong>
      {customerCount!==null&&customerCount>0&&<small>{customerCount} previous {customerCount===1?'customer':'customers'}</small>}</span><ArrowRight size={17}/></Link>
     <Link href="/listings" className="card home-quick"><ListChecks size={22}/><span><strong>My listings</strong><small>{listings.error?'Manage your listings':(listings.data||[]).filter(listing=>listing.is_active&&!listing.closed_at).length+' live listings'}</small></span><ArrowRight size={17}/></Link>
    </div>
    {activity('provider')}
   </>}/>
   <SeasonalReminders campaigns={seasonal}/>
  </section></AppShell>
}
