import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { requireProvider } from '@/lib/auth'
import { ActionForm } from '@/components/action-form'
import { LiveRefresh } from '@/components/live-refresh'
import { acceptOffer, changeOffer, jobQuestion, removeJob } from '../../work-actions'
import { statusLabel } from '@/lib/work'
import { SCHEDULES, MATERIALS, ACCESS, jobOwnerActions } from '@/lib/job-input'
import { formatOfferAmount, OFFER_MATERIALS_LABELS } from '@shared/offers'
import { OfferForm } from './offer-form'
import { saveWatchedJob } from '../../discovery-actions'
import { ShareJob } from './share-job'
export default async function JobPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params
 const {supabase,user,profile}=await requireProvider('/jobs/'+id)
 const {data:job,error}=await supabase.from('jobs_public').select('*').eq('id',id).maybeSingle()
 if(error)throw new Error('Could not load this job. Refresh to try again.');if(!job)notFound()
 const {data:watched,error:watchError}=await supabase.from('watchlist').select('id').eq('user_id',user.id).eq('job_id',id).maybeSingle()
 const own=job.requester_id===user.id
 let offerQuery=supabase.from('bids').select('id,provider_id,amount,message,status,available_from,estimated_duration,line_items,pricing_type,materials').eq('job_id',id).order('created_at',{ascending:false})
 if(!own)offerQuery=offerQuery.eq('provider_id',user.id)
 const [{data:offers,error:offerError},{data:questions,error:questionError}]=await Promise.all([offerQuery,supabase.from('job_questions').select('id,asker_id,question,answer,created_at').eq('job_id',id).order('created_at',{ascending:true})])
 const {data:sentInvites,error:sentInviteError}=own?await supabase.from('job_invites').select('id,provider_id,status').eq('job_id',id).eq('requester_id',user.id):{data:[],error:null}
 const ids=[...new Set([job.requester_id,...(sentInvites || []).map(i=>i.provider_id),...(offers || []).map(b=>b.provider_id),...(questions || []).map(q=>q.asker_id)])]
 const {data:people}=await supabase.from('profiles_public').select('id,full_name').in('id',ids)
 const names=new Map((people || []).map(p=>[p.id,p.full_name]))
 const ownerActions=jobOwnerActions(job.status,offerError?1:offers?.length || 0),myOffer=offers?.find(b=>b.provider_id===user.id),accepted=offers?.some(b=>b.status==='accepted'&&(own||b.provider_id===user.id))
 const schedule=job.schedule_type==='range'?job.date_from+' – '+job.date_to:job.schedule_type==='specific'?job.scheduled_date:SCHEDULES[job.schedule_type as keyof typeof SCHEDULES] || 'Flexible timing'
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/jobs" className="card-link">Back to Jobs</Link><header className="home-heading"><div><p className="eyebrow">{statusLabel(job.status)}</p><h1>{job.title}</h1></div><LiveRefresh/></header>
  {job.visibility==='invite_only'&&<p className="account-current">Private invited job — visible to the requester and invited providers.</p>}
  {watchError?<p role="alert">Could not check saved-job status. Refresh before saving.</p>:<ActionForm action={saveWatchedJob} label={watched?'Remove saved job':'Save job'}><input name="job_id" type="hidden" value={id}/><input name="intent" type="hidden" value={watched?'remove':'save'}/></ActionForm>}
  {own&&job.status==='open'&&<Link href="/connections" className="card-link">Invite a previous provider from Connections →</Link>}
  <article className="card work-detail"><p>{job.category} · {job.location_area || job.location_name || 'Location to be arranged'}</p><p className="work-description">{job.description}</p><strong>{job.price_type==='fixed'?'Budget: $'+job.price+'':'Open to offers'}</strong><p>{schedule}</p><p className="muted">Posted by <Link href={'/people/'+job.requester_id} className="card-link">{names.get(job.requester_id) || 'a community member'}</Link></p>
   {job.location_name&&<p>Property location: {job.location_name}</p>}{job.location_note&&<p className="work-description">Location note: {job.location_note}</p>}
   {job.latitude!=null&&job.longitude!=null&&<a className="card-link" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(job.latitude+','+job.longitude)} target="_blank" rel="noopener noreferrer">Open job location in Maps</a>}
   {job.hide_exact_location&&<p className="muted">The exact property location, GPS and location note are shared with the accepted provider.</p>}
   {job.materials_type&&<p>Materials: {MATERIALS[job.materials_type as keyof typeof MATERIALS] || job.materials_type}</p>}
   {job.access_conditions?.length>0&&<p>Site access: {job.access_conditions.map((a:string)=>ACCESS[a as keyof typeof ACCESS] || a).join(', ')}</p>}
   {job.photos?.length>0&&<div className="job-photo-grid">{job.photos.map((url:string,i:number)=><a key={url} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={'Job photo '+(i+1)}/></a>)}</div>}
   <p className="muted">Agree scope, timing and payment directly. Rural Connections does not handle payments.</p>
  </article>
  <div className="lform-actions">{(own||accepted)&&<Link className="lform-save" href={'/activity/job/'+id+'/manage'}>Manage job {job.status==='completed'?'& reviews':''}</Link>}{own&&ownerActions.edit&&<Link className="lform-cancel" href={'/jobs/'+id+'/edit'}>Edit job</Link>}{own&&ownerActions.repeat&&<Link className="lform-cancel" href={'/jobs/new?repeat='+id}>Repeat this job</Link>}{accepted&&<Link className="lform-cancel" href={'/activity/job/'+id}>Open conversation</Link>}<ShareJob title={job.title} publicJob={job.visibility==='public'&&job.status==='open'}/></div>
  {offerError?<p role="alert" className="card">Could not load offers. Refresh to try again.</p>:<section className="card" id="offer"><h2>{own?'Offers':myOffer?'Your offer':'Send an offer'}</h2>
   {own&&!offers?.length&&<p className="muted">Offers will appear here when people respond.</p>}
   {offers?.map(b=><article className="work-offer" key={b.id}><h3>{own?<Link href={'/people/'+b.provider_id} className="card-link">{names.get(b.provider_id) || 'Provider'}</Link>:'Your offer'} · {formatOfferAmount(b.amount,b.pricing_type)}</h3><p className="work-description">{b.message}</p><p>{b.status==='pending'?'Awaiting response':b.status==='rejected'?'Not selected':statusLabel(b.status)}</p>{b.line_items?.length>0&&<ul>{b.line_items.map((item:{label:string;amount:number},i:number)=><li key={i}>{item.label}: ${item.amount}</li>)}</ul>}{b.materials&&<p>{OFFER_MATERIALS_LABELS[b.materials as keyof typeof OFFER_MATERIALS_LABELS] || b.materials}</p>}{b.available_from&&<p>Available from: {b.available_from}</p>}{b.estimated_duration&&<p>Estimated duration: {b.estimated_duration}</p>}
    {job.status==='open'&&b.status==='pending'&&(own?<details className="activity-action"><summary>Accept this offer</summary><ActionForm action={acceptOffer} label="Accept offer"><input type="hidden" name="offer_id" value={b.id}/><p>Accepting awards this job to {names.get(b.provider_id) || 'this provider'} and declines the other pending offers. The accepted provider can see the exact location.</p><label className="account-setting"><input type="checkbox" required/>I agree to accept this offer.</label></ActionForm></details>:<>
     <details className="activity-action"><summary>Edit your offer</summary><OfferForm jobId={id} offer={b} providerMaterials={job.materials_type==='provider'}/></details>
     <details className="activity-action"><summary>Withdraw offer</summary><ActionForm action={changeOffer} label="Withdraw offer"><input type="hidden" name="offer_id" value={b.id}/><input type="hidden" name="intent" value="withdraw"/><p>This removes your pending offer. You can send a new offer while the job is open.</p><label className="account-setting"><input type="checkbox" name="confirmed" required/>I want to withdraw this offer.</label></ActionForm></details></>)}
   </article>)}
   {!own&&!myOffer&&job.status==='open'&&<OfferForm jobId={id} providerMaterials={job.materials_type==='provider'}/>}
   {!own&&myOffer&&<Link href="/activity" className="card-link">Track it in Activity →</Link>}
   {!own&&!myOffer&&job.status!=='open'&&<p>This job is no longer accepting offers.</p>}
  </section>}
  {own&&<section className="card"><h2>Invited providers</h2>{sentInviteError?<p role="alert">Could not load invitations. Refresh to try again.</p>:sentInvites?.length?sentInvites.map(i=><p key={i.id}><Link href={'/people/'+i.provider_id} className="card-link">{names.get(i.provider_id) || 'Previous provider'}</Link> · {offers?.some(b=>b.provider_id===i.provider_id)?'Offer received':i.status==='declined'?'Invitation declined':i.status==='seen'?'Opened — awaiting an offer':'Invitation sent'}</p>):<p className="muted">No providers invited yet.</p>}{job.status==='open'&&<Link href="/connections" className="card-link">Invite a previous provider →</Link>}</section>}
  <section className="card"><h2 id="questions">Questions & answers</h2><p className="muted">Questions and answers are public. Keep phone numbers, exact addresses and other private details out of them.</p>{questionError?<p role="alert">Could not load questions. Refresh to try again.</p>:<>{!questions?.length&&<p>No questions yet.</p>}{questions?.map(q=><article className="work-offer" key={q.id}><h3>{names.get(q.asker_id) || 'Community member'} asks</h3><p className="work-description">{q.question}</p>{q.answer&&<div className="account-current"><strong>Requester&apos;s answer</strong><p className="work-description">{q.answer}</p></div>}{own&&job.status==='open'&&<details className="activity-action"><summary>{q.answer?'Edit answer':'Answer question'}</summary><ActionForm action={jobQuestion} label="Save answer"><input type="hidden" name="job_id" value={id}/><input type="hidden" name="question_id" value={q.id}/><label className="lform-field">Public answer<textarea name="answer" rows={3} maxLength={2000} required defaultValue={q.answer || ''}/></label></ActionForm></details>}</article>)}{!own&&job.status==='open'&&<ActionForm action={jobQuestion} label="Ask question"><input type="hidden" name="job_id" value={id}/><label className="lform-field">Your public question<textarea name="question" rows={3} maxLength={2000} required/></label></ActionForm>}</>}</section>
  {own&&ownerActions.delete&&<details className="card activity-action"><summary>Delete job</summary><ActionForm action={removeJob} label="Permanently delete job"><input type="hidden" name="job_id" value={id}/><p>This permanently deletes the job and its offers, messages, questions and associated records. It cannot be undone.</p><label className="account-setting"><input type="checkbox" name="confirmed" required/>I want to permanently delete this job.</label></ActionForm></details>}
 </section></AppShell>
}
