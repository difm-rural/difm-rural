import {formatDate as nzDate} from '@shared/formatting'
import {bookingNextMove} from '@shared/nextMove'
import Link from '@/components/navigation-link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { requireProvider } from '@/lib/auth'
import { LiveRefresh } from '@/components/live-refresh'
import { statusLabel } from '@/lib/work'
import { loadActivityWork } from '@/lib/activity-data'
import { workActions, workRole } from '@/lib/activity-policy'
import { BookingDetails } from '../../activity/booking-details'
import { BookingSchedule } from '../../activity/booking-schedule'
import { loadConversation } from '@/lib/messaging-data'
import { Conversation } from '@/components/conversation/conversation'
import { ManageActions } from '@/components/work/manage-actions'
import { ReviewsSection } from '@/components/work/reviews-section'

// The booking workspace — the single home for a service booking: details,
// schedule, management, reviews and the conversation (sticky side panel). Mirrors
// the job workspace; bookings always have both participants so it's two-column.
export default async function BookingWorkspace({params}:{params:Promise<{id:string}>}){
  const {id}=await params
  const {supabase,user,profile}=await requireProvider('/bookings/'+id)
  const work=await loadActivityWork(supabase,'booking',id)
  if(!work)notFound()
  const role=workRole(work,user.id)
  if(!role)notFound()
  const other=role==='provider'?work.requesterId:work.providerId
  const {data:person}=other?await supabase.from('profiles_public').select('full_name,created_at').eq('id',other).maybeSingle():{data:null}
  const otherFirst=person?.full_name?.trim().split(/\s+/)[0] || 'the other person'
  const actions=workActions(work,user.id)
  const next=bookingNextMove(work.booking,role,{otherName:person?.full_name})

  let reviews:{id:string;reviewer_id:string;reviewer_role:string;rating:number;comment:string|null;created_at:string}[]|null=null,reviewError=false
  if(work.status==='completed'){const r=await supabase.from('reviews').select('id,reviewer_id,reviewer_role,rating,comment,created_at').eq('booking_id',id);reviewError=!!r.error;reviews=r.data}
  const ownReview=reviews?.find(x=>x.reviewer_id===user.id&&x.reviewer_role===role)
  const received=reviews?.find(x=>x.reviewer_id===other&&x.reviewer_role!==role)

  let conversation=null
  if(other){try{conversation=await loadConversation(supabase,user.id,{kind:'booking',id,person:other})}catch{}}
  const twoCol=!!conversation

  const b=work.booking!
  const timeline:string[]=['Requested '+nzDate(b.created_at)]
  if(b.quote_amount!=null)timeline.push('Quote sent')
  if(['confirmed','in_progress','awaiting_completion','completed'].includes(work.status))timeline.push('Confirmed')
  if(work.status==='completed')timeline.push('Completed')
  if(received||ownReview)timeline.push('Reviewed')
  const history=['completed','cancelled','withdrawn','declined'].includes(work.status)

  const headerCard=<article className="card work-detail"><h2>Booking details</h2><p>{role==='provider'?'Requester':'Provider'}: {person?.full_name || (other?'Name unavailable':'—')}</p>
    {person?.created_at && <p className="muted">Member since {new Date(person.created_at).toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}</p>}
    {other && <p><Link href={'/people/'+other+'/reviews?role='+(role==='provider'?'requester':'provider')} className="card-link">View profile & reviews →</Link></p>}
    {work.status==='cancellation_requested' && <p className="home-load-error">Cancellation requested — waiting for the provider to confirm.</p>}
    {work.cancellationReason && <p>Cancellation reason: {work.cancellationReason}</p>}
    {work.cancellationNote && <p className="work-description">{work.cancellationNote}</p>}
  </article>

  const mainColumn=<>
    {next&&<div className={'work-nextstep'+(next.needsAction?' needs-action':'')}><strong>{next.label}</strong><span>{next.detail}</span></div>}
    {headerCard}
    {!!timeline.length&&<p className="work-timeline muted">{timeline.join(' · ')}</p>}
    {actions.filter(a=>a!=='review').length>0&&<div className="lform-actions"><a className="lform-cancel" href="#manage">Manage this booking</a></div>}
    <BookingDetails booking={work.booking!} userId={user.id}/>
    {work.listingKind!=='grazing' && ['confirmed','in_progress','completed'].includes(work.status) && <BookingSchedule bookingId={id} userId={user.id} providerId={work.providerId!} status={work.status}/>}
    <ManageActions kind="booking" id={id} actions={actions} otherFirst={otherFirst}/>
    {work.status==='completed'&&<ReviewsSection kind="booking" id={id} actions={actions} personName={person?.full_name || null} received={received} ownReview={ownReview} reviewError={reviewError}/>}
    {work.status==='completed'&&<p className="home-clear">Booking complete. You can find it again in History.</p>}
  </>

  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
    <Link href={'/activity'+(history?'?view=history':'')} className="card-link">Back to {history?'History':'Activity'}</Link>
    <header className="home-heading"><div><p className="eyebrow">{statusLabel(work.status)}</p><h1>{work.title}</h1></div><LiveRefresh/></header>
    {twoCol?<div className="work-workspace"><div className="work-main">{mainColumn}</div><aside className="work-conversation" id="conversation"><Conversation compact context={conversation!}/></aside></div>:mainColumn}
  </section></AppShell>
}
