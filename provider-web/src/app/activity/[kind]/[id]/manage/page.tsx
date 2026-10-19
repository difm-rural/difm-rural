import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ActionForm } from '@/components/action-form'
import { LiveRefresh } from '@/components/live-refresh'
import { loadActivityWork } from '@/lib/activity-data'
import { workActions, workRole, type WorkAction } from '@/lib/activity-policy'
import { statusLabel } from '@/lib/work'
import { manageArrangement, reviewArrangement } from '../../../actions'

const ACTIONS: Record<Exclude<WorkAction,'review'>,{label:string;detail:string}>={
  complete:{label:'Mark complete',detail:'Mark this work complete when it has finished. Both people can then leave a review.'},
  cancel:{label:'Cancel job',detail:'This closes the job. If an offer has been accepted, the provider will be notified.'},
  withdraw:{label:'Withdraw request',detail:'This request has not been accepted. You can withdraw it now; the provider will be notified.'},
  request_cancel:{label:'Request cancellation',detail:'The provider needs to confirm cancellation. The arrangement remains active until they do.'},
  confirm_cancel:{label:'Confirm cancellation',detail:'The requester has asked to cancel. Confirming ends this arrangement.'},
  close_grazing:{label:'Complete & close listing',detail:'Complete the finished arrangement and hide the grazing listing from discovery. Other bookings stay unchanged. You can relist later.'},
  relist_grazing:{label:'Complete & relist',detail:'Complete this arrangement and advertise the grazing listing for new enquiries and requests. Other bookings stay unchanged.'},
  relist:{label:'Relist grazing',detail:'Make this grazing listing available again. The completed arrangement and its reviews remain in History.'},
}
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
  const ownReview=reviews?.find(r=>r.reviewer_id===user.id && r.reviewer_role===role)
  const received=reviews?.find(r=>r.reviewer_id===other && r.reviewer_role!==role)
  const history=!['open','pending','quote_sent','confirmed','accepted','in_progress','awaiting_completion','cancellation_requested'].includes(work.status)
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
    <Link href={'/activity'+(history?'?view=history':'')} className="card-link">Back to {history?'History':'Activity'}</Link>
    <header className="home-heading"><div><p className="eyebrow">{statusLabel(work.status)}</p><h1>{work.title}</h1></div><LiveRefresh/></header>
    <article className="card work-detail"><h2>{kind==='booking'?'Booking details':'Job details'}</h2><p>{role==='provider'?'Requester':'Provider'}: {person?.full_name || (other?'Name unavailable':'No provider accepted yet')}</p>
      {person?.created_at && <p className="muted">Member since {new Date(person.created_at).toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}</p>}
      {other && <p><Link href={'/people/'+other} className="card-link">View profile & reviews →</Link></p>}
      {work.location && <p>Location: {work.location}</p>}{work.notes && <p className="work-description">{work.notes}</p>}
      {work.status==='cancellation_requested' && <p className="home-load-error">Cancellation requested — waiting for the provider to confirm.</p>}
      {work.cancellationReason && <p>Cancellation reason: {work.cancellationReason}</p>}
      {work.cancellationNote && <p className="work-description">{work.cancellationNote}</p>}
      {work.listingKind==='grazing' && ['confirmed','in_progress'].includes(work.status) && <p>Grazing arrangement accepted. Use Chat to agree ongoing details, dates and payment. When it finishes, the provider can complete it and close or relist the listing.</p>}
      {other && <Link className="lform-save" href={'/activity/'+kind+'/'+id}>Open conversation</Link>}
      {kind==='job' && <p><Link className="card-link" href={'/jobs/'+id}>View job and offers →</Link></p>}
      {kind==='job' && role==='requester' && <div className="lform-actions">{work.status==='open' && <Link className="lform-cancel" href={'/jobs/'+id+'/edit'}>Edit job</Link>}{['completed','cancelled'].includes(work.status) && <Link className="lform-cancel" href={'/jobs/new?repeat='+id}>Repeat this job</Link>}</div>}
    </article>
    {actions.filter(a=>a!=='review').length>0 && <section className="card"><h2>Manage this arrangement</h2><p className="muted">Choose an action to see what will happen before confirming.</p>
      {actions.filter((a):a is Exclude<WorkAction,'review'>=>a!=='review').map(intent=><details className="activity-action" key={intent}><summary>{ACTIONS[intent].label}</summary>
        <ActionForm action={manageArrangement} label={ACTIONS[intent].label}>
          <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="intent" value={intent}/>
          <p>{ACTIONS[intent].detail}</p>
          {['cancel','withdraw','request_cancel'].includes(intent) && <><label className="lform-field">Reason *<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option>{['No longer needed','Found someone else','Budget has changed','Posted by mistake','Provider not responding','Other'].map(r=><option key={r}>{r}</option>)}</select></label><label className="lform-field">Additional details (optional)<textarea name="note" rows={3}/></label></>}
          <label className="activity-confirm"><input type="checkbox" required/> I confirm I want to {ACTIONS[intent].label.toLowerCase()}.</label>
        </ActionForm>
      </details>)}
    </section>}
    {work.status==='completed' && <section className="card"><h2>Reviews</h2>
      {reviewError?<p role="alert">Could not load reviews. Refresh before adding or editing your review.</p>:<>
        {received && <article className="activity-received"><h3>{person?.full_name || 'Their'} review of you</h3><p>{'★'.repeat(received.rating)} · {new Date(received.created_at).toLocaleDateString('en-NZ')}</p><p className="work-description">{received.comment || 'No written comment.'}</p></article>}
        {!received && <p className="muted">The other person has not left a review yet.</p>}
        {actions.includes('review') && <ActionForm key={ownReview?.id || 'new'} action={reviewArrangement} label={ownReview?'Save review changes':'Submit review'}>
          <h3>{ownReview?'Edit your review':'Review '+(person?.full_name || 'the other person')}</h3>
          <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/>
          <label className="lform-field">Rating *<select name="rating" required defaultValue={ownReview?.rating || ''}><option value="" disabled>Choose a rating</option>{[5,4,3,2,1].map(n=><option value={n} key={n}>{n} {n===1?'star':'stars'}</option>)}</select></label>
          <label className="lform-field">Comments (optional)<textarea name="comment" rows={4} defaultValue={ownReview?.comment || ''} placeholder="Share your experience working with this person."/></label>
          <p className="muted">Your rating and comments are public.</p>
        </ActionForm>}
      </>}
    </section>}
    {work.status==='completed' && <p className="home-clear">Arrangement complete. You can find it again in History.</p>}
  </section></AppShell>
}
