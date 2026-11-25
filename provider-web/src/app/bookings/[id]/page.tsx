import {grazingCompletionFeedback} from '@shared/bookingLifecycleUx'
import {BookingSentNotice} from '@/components/work/booking-sent-notice'
import {bookingNextMove,nextMoveHeading} from '@shared/nextMove'
import Link from '@/components/navigation-link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SideKicker } from '@/components/side-kicker'
import { requireProvider } from '@/lib/auth'
import { markNotificationsReadFor } from '@/lib/notification-read'
import { LiveRefresh } from '@/components/live-refresh'
import { loadActivityWork } from '@/lib/activity-data'
import { workActions, workRole } from '@/lib/activity-policy'
import { BookingDetails,BookingResponses } from '../../activity/booking-details'
import { BookingSchedule } from '../../activity/booking-schedule'
import { loadConversation } from '@/lib/messaging-data'
import { Conversation } from '@/components/conversation/conversation'
import { ManageActions } from '@/components/work/manage-actions'
import { ReviewsSection } from '@/components/work/reviews-section'
import { PropertyNetworkSuggestion } from '@/components/work/property-network-suggestion'

// The booking workspace — the single home for a service booking: details,
// schedule, management, reviews and the conversation (sticky side panel). Mirrors
// the job workspace; bookings always have both participants so it's two-column.
export default async function BookingWorkspace({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{reviewed?:string;sent?:string}>}){
  const {id}=await params
  const {reviewed,sent}=await searchParams
  const {supabase,user,profile}=await requireProvider('/bookings/'+id)
  const [work]=await Promise.all([loadActivityWork(supabase,'booking',id),markNotificationsReadFor(supabase,user.id,{bookingId:id})])
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
  const chatFirst=conversation&&conversation.name&&conversation.name!=='Community member'?conversation.name.trim().split(/\s+/)[0]:''
  const chatHeading=chatFirst?'Messages with '+chatFirst:'Messages'

  const {data:listingLocation}=role==='requester'&&['confirmed','in_progress','completed','cancellation_requested'].includes(work.status)?await supabase.from('service_private_locations').select('location_name,latitude,longitude').eq('service_id',work.booking!.service_id).maybeSingle():{data:null}
  const b=work.booking!
  const history=['completed','cancelled','withdrawn','declined'].includes(work.status)

  const headerCard=<div><p>{role==='provider'?'Requester':'Provider'}: {person?.full_name || (other?'Name unavailable':'—')}</p>
    {person?.created_at && <p className="muted">Member since {new Date(person.created_at).toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}</p>}
    {other && <p><Link href={'/people/'+other+'/reviews?role='+(role==='provider'?'requester':'provider')} className="card-link">View profile & reviews →</Link></p>}
    {work.status==='cancellation_requested' && <p className="home-load-error">Cancellation requested — waiting for the provider to confirm.</p>}
    {work.cancellationReason && <p>Cancellation reason: {work.cancellationReason}</p>}
    {work.cancellationNote && <p className="work-description">{work.cancellationNote}</p>}
  </div>

  const mainColumn=<>
    {sent==='1'&&role==='requester'&&work.status==='pending'&&<BookingSentNotice id={id} provider={person?.full_name||'the provider'}/>}
    {work.listingKind==='grazing'&&work.status==='completed'&&<section className="card" role="status"><h2>Grazing booking completed</h2><p>{role==='requester'?'The provider has marked this arrangement complete.':grazingCompletionFeedback(!!b.service?.is_active&&!b.service?.closed_at).message}</p>{reviewError?<p>Refresh to load your review.</p>:ownReview?<p>Your review has been submitted. <a href="#reviews" className="card-link">View your review →</a></p>:actions.includes('review')&&<a className="lform-save" href="#reviews">{role==='requester'?'Leave a review':'Review requester'}</a>}</section>}
    {next&&work.listingKind!=='grazing'&&<div className={'work-nextstep'+(next.needsAction?' needs-action':'')}>{nextMoveHeading(next)&&<strong>{nextMoveHeading(next)}</strong>}<span>{next.detail}</span></div>}
    <BookingDetails booking={work.booking!} userId={user.id} participant={headerCard} privateLocation={listingLocation} includeResponses={false}/>
    {work.listingKind!=='grazing' && ['confirmed','in_progress','completed'].includes(work.status) && <BookingSchedule bookingId={id} userId={user.id} providerId={work.providerId!} status={work.status}/>}
    <section className="card"><h2>Reviews and booking management</h2>
    <BookingResponses booking={b} userId={user.id} embedded/>
    <ManageActions kind="booking" id={id} actions={actions} otherFirst={otherFirst} embedded/>
    {work.status==='completed'&&<ReviewsSection kind="booking" id={id} actions={actions} personName={person?.full_name || null} personId={other} received={received} ownReview={ownReview} reviewError={reviewError} justReviewed={reviewed==='1'} embedded/>}
    </section>
    {work.status==='completed'&&role==='requester'&&ownReview&&other&&<PropertyNetworkSuggestion owner={user.id} providerId={other} providerName={person?.full_name||null} category={(b.service as {category?:string|null}|null)?.category} kind={work.listingKind} title={work.title}/>}
  </>

  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
    <Link href={'/activity'+(history?'?view=history':'')} className="card-link">Back to {history?'History':'Activity'}</Link>
    <header className="home-heading work-head listing-head"><div><SideKicker side="listing" label={role==='provider'?'Listings · offered':'Listings · requested'}/><h1>{work.title}</h1></div><LiveRefresh/></header>
    {twoCol?<div className="work-workspace"><div className="work-main">{mainColumn}</div><aside className="work-conversation" id="conversation"><Conversation compact context={conversation!} heading={chatHeading}/></aside></div>:mainColumn}
  </section></AppShell>
}
