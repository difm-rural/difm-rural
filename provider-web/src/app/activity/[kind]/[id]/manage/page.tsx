import Link from '@/components/navigation-link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { loadActivityWork } from '@/lib/activity-data'
import { workActions, workRole } from '@/lib/activity-policy'
import { statusLabel } from '@/lib/work'
import { BookingDetails } from '../../../booking-details'
import { allPublicReviews } from '@/lib/profile-data'
import { BookingSchedule } from '../../../booking-schedule'
import { ManageActions } from '@/components/work/manage-actions'
import { ReviewsSection } from '@/components/work/reviews-section'

export default async function ManageArrangementPage({params}:{params:Promise<{kind:string;id:string}>}){
  const {supabase,user,profile}=await requireProvider();const {kind,id}=await params
  if(kind!=='job' && kind!=='booking')notFound()
  const work=await loadActivityWork(supabase,kind,id)
  if(!work || !workRole(work,user.id))notFound()
  const role=workRole(work,user.id)!,other=role==='provider'?work.requesterId:work.providerId
  const actions=workActions(work,user.id)
  const [{data:person},{data:reviews,error:reviewError}]=await Promise.all([
    other?supabase.from('profiles_public').select('full_name,created_at').eq('id',other).maybeSingle():Promise.resolve({data:null}),
    supabase.from('reviews').select('id,reviewer_id,reviewer_role,rating,comment,created_at').eq(kind==='job'?'job_id':'booking_id',id),
  ])
  let ratingCount=0,average=0,ratingError=false
  if(other){try{const received= (await allPublicReviews(supabase,other)).filter(r=>r.reviewee_role===(role==='provider'?'requester':'provider'));ratingCount=received.length;average=ratingCount?received.reduce((sum,r)=>sum+r.rating,0)/ratingCount:0}catch{ratingError=true}}
  const ownReview=reviews?.find(r=>r.reviewer_id===user.id && r.reviewer_role===role)
  const received=reviews?.find(r=>r.reviewer_id===other && r.reviewer_role!==role)
  const otherFirst=person?.full_name?.trim().split(/\s+/)[0] || 'the other person'
  const history=!['open','pending','quote_sent','confirmed','accepted','in_progress','awaiting_completion','cancellation_requested'].includes(work.status)
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
    <Link href={'/activity'+(history?'?view=history':'')} className="card-link">Back to {history?'History':'Activity'}</Link>
    <header className="home-heading"><div><p className="eyebrow">{statusLabel(work.status)}</p><h1>{work.title}</h1></div><LiveRefresh/></header>
    <article className="card work-detail"><h2>{kind==='booking'?'Booking details':'Job details'}</h2><p>{role==='provider'?'Requester':'Provider'}: {person?.full_name || (other?'Name unavailable':'No provider accepted yet')}</p>
      {person?.created_at && <p className="muted">Member since {new Date(person.created_at).toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}</p>}
      {other && <p><Link href={'/people/'+other+'/reviews?role='+(role==='provider'?'requester':'provider')} className="card-link">{ratingError?'View profile & reviews':ratingCount?'★ '+average.toFixed(1)+' · '+ratingCount+' reviews — read comments':'No reviews yet — view profile'}</Link></p>}
      {kind==='job' && work.location && <p>Location: {work.location}</p>}{kind==='job' && work.notes && <p className="work-description">{work.notes}</p>}
      {work.status==='cancellation_requested' && <p className="home-load-error">Cancellation requested — waiting for the provider to confirm.</p>}
      {work.cancellationReason && <p>Cancellation reason: {work.cancellationReason}</p>}
      {work.cancellationNote && <p className="work-description">{work.cancellationNote}</p>}
      {other && <Link className="lform-save" href={'/activity/'+kind+'/'+id}>Open conversation</Link>}
      {kind==='job' && <p><Link className="card-link" href={'/jobs/'+id}>View job and offers →</Link></p>}
      {kind==='job' && role==='requester' && <div className="lform-actions">{work.status==='open' && <Link className="lform-cancel" href={'/jobs/'+id+'/edit'}>Edit job</Link>}{['completed','cancelled'].includes(work.status) && <Link className="lform-cancel" href={'/jobs/new?repeat='+id}>Repeat this job</Link>}</div>}
    </article>
    {work.booking && <BookingDetails booking={work.booking} userId={user.id}/>}
    {work.booking && work.listingKind!=='grazing' && ['confirmed','in_progress','completed'].includes(work.status) && <BookingSchedule bookingId={id} userId={user.id} providerId={work.providerId!} status={work.status}/>}
    <ManageActions kind={kind} id={id} actions={actions} otherFirst={otherFirst}/>
    {work.status==='completed' && <ReviewsSection kind={kind} id={id} actions={actions} personName={person?.full_name || null} received={received} ownReview={ownReview} reviewError={!!reviewError}/>}
    {work.status==='completed' && <p className="home-clear">Arrangement complete. You can find it again in History.</p>}
  </section></AppShell>
}
