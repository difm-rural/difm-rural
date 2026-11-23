import {formatMoney as nzMoney,formatDateTime as nzDateTime} from '@shared/formatting'
import Link from '@/components/navigation-link'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { statusLabel } from '@/lib/work'
import { bookingNextMove, jobNextMove, nextMoveHeading, type NextMove } from '@shared/nextMove'
import { activityIsActive } from '@/lib/activity-policy'
import { loadInbox, unreadNotices } from '@/lib/messaging-data'
import {homeUpcoming,homeWorkFocus,homeWorkLabel} from '@shared/homeSummary'
export const dynamic='force-dynamic'
// Top label on an activity card: whose turn + what's next ("Waiting on you to
// confirm") when there is a next move; otherwise the status word, which is what
// completed / cancelled / declined work keeps. The line under it drops a
// "Waiting on …" heading the badge already says and keeps the detail.
function TurnLabel({next,fallback}:{next:NextMove|null;fallback:string}){
  if(!next)return <p className="work-badge">{fallback}</p>
  const heading=nextMoveHeading(next)
  return <><p className={'work-badge'+(next.badgeTone==='attention'?' attention':'')}>{next.badge}</p><p className="muted work-badge-detail">{heading?heading+' · ':''}{next.detail}</p></>
}
export default async function ActivityPage({searchParams}:{searchParams:Promise<{view?:string;focus?:string}>}){
  const {view,focus:requestedFocus}=await searchParams
  const history=view==='history'
  const focus=history?null:homeWorkFocus(requestedFocus)
  const {supabase,user,profile}=await requireProvider()
  const [jobs,offers,bookings]=await Promise.all([
    supabase.from('jobs').select('id,title,status,created_at,scheduled_date,date_from').eq('requester_id',user.id).order('created_at',{ascending:false}),
    supabase.from('bids').select('id,job_id,amount,status,payment_method,payment_sorted_at').eq('provider_id',user.id),
    supabase.from('bookings').select('*,service:services_public(title,kind,pricing_type)').or('requester_id.eq.'+user.id+',provider_id.eq.'+user.id).order('created_at',{ascending:false}),
  ])
  const jobIds=[...new Set((offers.data || []).map(o=>o.job_id))]
  const offerJobs=jobIds.length?await supabase.from('jobs_public').select('id,title,status,requester_id,scheduled_date,date_from').in('id',jobIds):{data:[],error:null}
  const shownJobs=focus?[]:(jobs.data || []).filter(j=>activityIsActive('job',j.status)!==history)
  const jobsById=new Map(shownJobs.map(job=>[job.id,job]))
  const questions=shownJobs.length ? await supabase.from('job_questions')
    .select('id,job_id,asker_id,question,answer').in('job_id',shownJobs.map(job=>job.id))
    .order('created_at',{ascending:false}) : {data:[],error:null}
  // Offers on your own active jobs: how many are waiting, and the accepted one's
  // provider + payment state — what the whose-turn label needs.
  const ownBids=shownJobs.length&&!history?await supabase.from('bids').select('job_id,provider_id,status,payment_method,payment_sorted_at').in('job_id',shownJobs.map(job=>job.id)).in('status',['pending','accepted']):{data:[],error:null}
  const pendingBidCount=new Map<string,number>()
  const acceptedBid=new Map<string,{provider_id:string;payment_method:string|null;payment_sorted_at:string|null}>()
  ;(ownBids.data || []).forEach(bid=>{if(bid.status==='accepted')acceptedBid.set(bid.job_id,bid);else pendingBidCount.set(bid.job_id,(pendingBidCount.get(bid.job_id) || 0)+1)})
  const nameIds=[...new Set([
    ...(bookings.data || []).flatMap(b=>[b.provider_id,b.requester_id]),
    ...(ownBids.data || []).filter(bid=>bid.status==='accepted').map(bid=>bid.provider_id),
    ...(offerJobs.data || []).map(job=>job.requester_id),
    ...(questions.data || []).map(question=>question.asker_id),
  ])]
  const people=nameIds.length?await supabase.from('profiles_public').select('id,full_name').in('id',nameIds):{data:[]}
  const names=new Map((people.data || []).map(p=>[p.id,p.full_name]))
  const activeJobs=(jobs.data || []).filter(j=>activityIsActive('job',j.status))
  const offerJobById=new Map((offerJobs.data||[]).map(job=>[job.id,job]))
  const activeOffers=(offers.data || []).filter(o=>activityIsActive('offer',o.status,offerJobs.data?.find(j=>j.id===o.job_id)?.status))
  const activeBookings=(bookings.data || []).filter(b=>activityIsActive('booking',b.status))
  const scheduledIds=focus==='upcoming'?activeOffers.filter(offer=>offer.status==='accepted').map(offer=>offer.job_id):[]
  const schedules=scheduledIds.length?await supabase.from('work_schedules').select('job_id,arrival_start_at').in('job_id',scheduledIds):{data:[],error:null}
  const arrivals=new Map((schedules.data||[]).map(row=>[row.job_id,row.arrival_start_at]))
  const hasError=[jobs,offers,bookings,offerJobs,schedules].some(r=>r.error)
  const shownOffers=focus?activeOffers.filter(offer=>{
   if(focus==='offers')return offer.status==='pending'
   if(offer.status!=='accepted')return false
   if(focus==='work')return true
   const arrivalAt=arrivals.get(offer.job_id)
   return !!arrivalAt&&homeUpcoming(jobNextMove(offerJobById.get(offer.job_id),'provider',{hasArrival:true,arrivalAt})?.tone||'','job',arrivalAt)
  }):(offers.data || []).filter(o=>activityIsActive('offer',o.status,offerJobById.get(o.job_id)?.status)!==history)
  const shownBookings=focus?activeBookings.filter(booking=>booking.provider_id===user.id&&focus!=='offers'&&
   (focus!=='upcoming'||bookingNextMove(booking,'provider')?.tone==='scheduled')):
   (bookings.data || []).filter(b=>activityIsActive('booking',b.status)!==history)
  const activeWork=activeJobs.length+activeOffers.length+activeBookings.length
  const historyCount=(jobs.data?.length || 0)+(offers.data?.length || 0)+(bookings.data?.length || 0)-activeWork
  // Unread messages per job/booking, and listing enquiry threads split by owner.
  let threads:Awaited<ReturnType<typeof loadInbox>>=[]
  try{threads=await loadInbox(supabase,user.id,await unreadNotices(supabase,user.id))}catch{}
  const unread=new Map<string,number>()
  threads.forEach(t=>unread.set(t.kind+':'+t.id,(unread.get(t.kind+':'+t.id) || 0)+t.unread))
  const ownedListings=await supabase.from('services').select('id').eq('provider_id',user.id)
  const ownedIds=new Set((ownedListings.data || []).map(r=>r.id))
  const ownerThreads=threads.filter(t=>t.kind==='listing' && ownedIds.has(t.id))
  const yourEnquiries=threads.filter(t=>t.kind==='listing' && !ownedIds.has(t.id))
  // "Active" includes the listing-enquiry threads shown on the Active tab.
  const activeCount=activeWork+ownerThreads.length+yourEnquiries.length
  // Render only populated sections; prompt or empty-state the rest.
  const someWorkEmpty=!shownJobs.length || !shownOffers.length || !shownBookings.length
  const anyItems=shownJobs.length>0 || shownOffers.length>0 || shownBookings.length>0 || (!focus&&(!!questions.data?.length || ownerThreads.length>0 || yourEnquiries.length>0))
  const ctaLinks=<><Link className="card-link" href="/jobs/new">Post a job</Link> · <Link className="card-link" href="/jobs">Find jobs</Link> · <Link className="card-link" href="/browse">Browse listings</Link></>
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><header className="home-heading"><div><h1>Activity</h1></div><LiveRefresh/></header>
    <nav className="activity-segments" aria-label="Activity view"><Link href="/activity" aria-current={!history?'page':undefined}>Active {!hasError && <span>{activeCount}</span>}</Link><Link href="/activity?view=history" aria-current={history?'page':undefined}>History {!hasError && <span>{historyCount}</span>}</Link></nav>
    {focus?<div className="lform-actions"><h2>{homeWorkLabel(focus)}</h2><Link href="/activity" className="card-link">Show all activity</Link></div>:
     <p className="muted">{history?'Completed and closed arrangements, with your reviews.':'Track your jobs, offers, booking requests and agreed work.'}</p>}
    {hasError && <p className="home-load-error" role="alert">Some activity could not be loaded. Refresh to try again.</p>}
    {(questions.error || !!questions.data?.length) && <section>
      <h2>Questions from providers</h2>
      {questions.error && <p role="alert">Could not load provider questions. Refresh to try again.</p>}
      <div className="work-grid">{questions.data?.map(question => {
        const job=jobsById.get(question.job_id)
        if(!job)return null
        return <article key={question.id} className="card work-detail">
          <h3>{job.title}</h3>
          <p className="muted">{names.get(question.asker_id) || 'Provider'} · {question.answer ? 'Answered' : 'Awaiting reply'}</p>
          <p className="work-description">{question.question}</p>
          {question.answer && <p className="work-description"><strong>Your reply</strong><br/>{question.answer}</p>}
          <Link className="card-link" href={'/jobs/'+job.id+'#question-'+question.id}>
            {job.status==='open'&&!question.answer ? 'Reply to question' : 'View question'} →
          </Link>
        </article>
      })}</div>
    </section>}
    {shownJobs.length>0 && <section><h2>Your jobs</h2><div className="work-grid">{shownJobs.map(j=><Link className="card" key={j.id} href={'/jobs/'+j.id+'#manage'}><h3>{j.title}{(unread.get('job:'+j.id) || 0)>0&&<span className="web-badge" aria-label={unread.get('job:'+j.id)+' unread messages'}> {unread.get('job:'+j.id)}</span>}</h3><TurnLabel fallback={statusLabel(j.status)} next={jobNextMove({...j,scheduled_date:j.scheduled_date,date_from:j.date_from},'requester',{otherName:names.get(acceptedBid.get(j.id)?.provider_id || ''),bidCount:pendingBidCount.get(j.id) || 0,unansweredQuestionCount:(questions.data || []).filter(q=>q.job_id===j.id&&!q.answer).length,paymentMethod:acceptedBid.get(j.id)?.payment_method,paymentSortedAt:acceptedBid.get(j.id)?.payment_sorted_at})}/><span className="card-link">View details & actions →</span></Link>)}</div></section>}
    {shownOffers.length>0 && <section><h2>Your offers</h2><div className="work-grid">{shownOffers.map(o=>{const job=offerJobs.data?.find(j=>j.id===o.job_id);return <article className="card" key={o.id}><h3><Link href={o.status==='accepted'?'/jobs/'+o.job_id+'#manage':'/jobs/'+o.job_id}>{job?.title || 'Job'}</Link>{(unread.get('job:'+o.job_id) || 0)>0&&<span className="web-badge" aria-label={unread.get('job:'+o.job_id)+' unread messages'}> {unread.get('job:'+o.job_id)}</span>}</h3><p>{nzMoney(o.amount)}</p><TurnLabel fallback={o.status==='pending'?'Awaiting response':statusLabel(o.status)} next={job&&['pending','accepted'].includes(o.status)?jobNextMove(job,'provider',{otherName:names.get(job.requester_id),hasPendingBid:o.status==='pending',paymentMethod:o.payment_method,paymentSortedAt:o.payment_sorted_at}):null}/>{o.status==='accepted' && <Link className="card-link" href={'/jobs/'+o.job_id+'#conversation'}>Open conversation →</Link>}</article>})}</div></section>}
    {shownBookings.length>0 && <section><h2>Bookings & requests</h2>
      <div className="work-grid">{shownBookings.map(b=>{const provider=b.provider_id===user.id, other=provider?b.requester_id:b.provider_id;return <article key={b.id} id={'booking-'+b.id} className="card work-detail"><p className="eyebrow">{provider?'Providing':'Requested by you'}</p><h3><Link href={'/bookings/'+b.id}>{b.service?.title || 'Booking'}</Link>{(unread.get('booking:'+b.id) || 0)>0&&<span className="web-badge" aria-label={unread.get('booking:'+b.id)+' unread messages'}> {unread.get('booking:'+b.id)}</span>}</h3><TurnLabel fallback={statusLabel(b.status)} next={bookingNextMove(b,provider?'provider':'requester',{otherName:names.get(other)})}/><p>{names.get(other) || 'Community member'}</p>{b.total_amount!=null&&<p>Requested base estimate: {nzMoney(b.total_amount)}</p>}<p>{b.location_name}</p><p>{b.scheduled_date}</p>{b.notes && <p className="work-description">{b.notes}</p>}
        {b.quote_amount!=null && <p>Quote: {nzMoney(b.quote_amount)}</p>}{b.quote_notes && <p>{b.quote_notes}</p>}
        {b.status==='confirmed' && <p>{b.service?.kind==='grazing'?'Grazing arrangement accepted. Use Chat to agree ongoing dates, details and payment.':'Your booking is confirmed. Use Chat to arrange details and payment.'}</p>}
        <Link href={'/bookings/'+b.id+'#manage'} className="lform-save">{b.status==='completed'?'View details & reviews':'View details & actions'}</Link>
        <Link href={'/bookings/'+b.id+'#conversation'} className="card-link">Open conversation →</Link>
      </article>})}</div>
    </section>}
    {!focus && !history && ownerThreads.length>0 && <section><h2>Enquiries on your listings</h2><div className="work-grid">{ownerThreads.map(t=><Link className="card" key={t.key} href={'/listings/'+t.id+'?thread='+t.person+'#enquiries'}><h3>{t.name}{t.unread>0&&<span className="web-badge" aria-label={t.unread+' unread messages'}> {t.unread}</span>}</h3><p className="muted">{t.title} · {nzDateTime(new Date(t.updatedAt))}</p><p className="work-description">{t.preview}</p><span className="card-link">Open enquiry →</span></Link>)}</div></section>}
    {!focus && !history && yourEnquiries.length>0 && <section><h2>Your enquiries</h2><div className="work-grid">{yourEnquiries.map(t=><Link className="card" key={t.key} href={'/listings/'+t.id+'#enquiry'}><h3>{t.name}{t.unread>0&&<span className="web-badge" aria-label={t.unread+' unread messages'}> {t.unread}</span>}</h3><p className="muted">{t.title} · {nzDateTime(new Date(t.updatedAt))}</p><p className="work-description">{t.preview}</p><span className="card-link">View listing →</span></Link>)}</div></section>}
    {!hasError&&focus&&!anyItems&&<p className="muted">No matching work is currently active.</p>}
    {!focus&&!hasError && (anyItems
      ? someWorkEmpty && <p className="muted">Nothing else on the go — {ctaLinks}</p>
      : <div className="home-empty"><h2>{history?'Nothing in your history yet':'Nothing on the go yet'}</h2><p>{history?'Completed and closed work will show here.':'Post a job, make an offer or book a listing to get started.'}</p><p className="muted">{ctaLinks}</p></div>)}
  </section></AppShell>
}
