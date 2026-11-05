import {jobMapTarget} from '@shared/jobMapTarget'
import {formatMoney as nzMoney,formatDate as nzDate} from '@shared/formatting'
import {jobNextMove} from '@shared/nextMove'
import Link from '@/components/navigation-link'
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
import { loadConversation } from '@/lib/messaging-data'
import { Conversation } from '@/components/conversation/conversation'
import { ManageActions } from '@/components/work/manage-actions'
import { ReviewsSection } from '@/components/work/reviews-section'
import { workActions, workRole, type ActivityWork } from '@/lib/activity-policy'

export default async function JobPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{thread?:string|string[]}>}){
 const {id}=await params
 const {thread}=await searchParams
 const threadParam=Array.isArray(thread)?thread[0]:thread
 const {supabase,user,profile}=await requireProvider('/jobs/'+id)
 const {data:job,error}=await supabase.from('jobs_public').select('*').eq('id',id).maybeSingle()
 if(error)throw new Error('Could not load this job. Refresh to try again.');if(!job)notFound()
 const {data:watched,error:watchError}=await supabase.from('watchlist').select('id').eq('user_id',user.id).eq('job_id',id).maybeSingle()
 const own=job.requester_id===user.id
 const canAskQuestion=!own&&job.status==='open'
 let offerQuery=supabase.from('bids').select('id,provider_id,amount,message,status,available_from,estimated_duration,line_items,pricing_type,materials').eq('job_id',id).order('created_at',{ascending:false})
 if(!own)offerQuery=offerQuery.eq('provider_id',user.id)
 const [{data:offers,error:offerError},{data:questions,error:questionError}]=await Promise.all([offerQuery,supabase.from('job_questions').select('id,asker_id,question,answer,created_at').eq('job_id',id).order('created_at',{ascending:true})])
 const {data:sentInvites,error:sentInviteError}=own?await supabase.from('job_invites').select('id,provider_id,status').eq('job_id',id).eq('requester_id',user.id):{data:[],error:null}
 const ids=[...new Set([job.requester_id,...(sentInvites || []).map(i=>i.provider_id),...(offers || []).map(b=>b.provider_id),...(questions || []).map(q=>q.asker_id)])]
 const {data:people}=await supabase.from('profiles_public').select('id,full_name').in('id',ids)
 const names=new Map((people || []).map(p=>[p.id,p.full_name]))
 const ownerActions=jobOwnerActions(job.status,offerError?1:offers?.length || 0),myOffer=offers?.find(b=>b.provider_id===user.id)
 const mapTarget=jobMapTarget(job)
 const schedule=job.schedule_type==='range'?nzDate(job.date_from)+' – '+nzDate(job.date_to):job.schedule_type==='specific'?nzDate(job.scheduled_date):SCHEDULES[job.schedule_type as keyof typeof SCHEDULES] || 'Flexible timing'

 // ─── Workspace state ────────────────────────────────────────────────────────
 const acceptedOffer=offers?.find(b=>b.status==='accepted')
 const acceptedProviderId=acceptedOffer?.provider_id || null
 const isAcceptedProvider=!!acceptedProviderId && acceptedProviderId===user.id
 const awarded=job.status!=='open'   // accepted/in_progress/awaiting/cancellation_requested/completed/cancelled
 // ActivityWork for the shared manage + review policy (reuses workActions/workRole).
 const work:ActivityWork={id:job.id,kind:'job',status:job.status,requesterId:job.requester_id,providerId:acceptedProviderId,title:job.title,location:job.location_name,notes:job.description,cancellationReason:job.cancellation_reason,cancellationNote:job.cancellation_note}
 const manageRole=workRole(work,user.id)   // requester | provider | null
 const actions=workActions(work,user.id)
 const otherId=manageRole==='provider'?job.requester_id:acceptedProviderId
 const otherFirst=(otherId?names.get(otherId):'')?.trim().split(/\s+/)[0] || 'the other person'

 // Next-step bar: requester (owner) / provider (active bidder or accepted provider); never for a plain viewer.
 const nextRole:'requester'|'provider'|null=own?'requester':(job.status==='open'&&myOffer?'provider':(isAcceptedProvider?'provider':null))
 const nextOtherName=own?(acceptedProviderId?names.get(acceptedProviderId):undefined):names.get(job.requester_id)
 const next=nextRole?jobNextMove(job,nextRole,{otherName:nextOtherName,bidCount:own?(offerError?0:offers?.length||0):0,unansweredQuestionCount:own?(questions?.filter(q=>!q.answer).length||0):0,hasPendingBid:myOffer?.status==='pending'}):null

 // Reviews (completed only).
 let reviews:{id:string;reviewer_id:string;reviewer_role:string;rating:number;comment:string|null;created_at:string}[]|null=null,reviewError=false
 if(job.status==='completed'){const r=await supabase.from('reviews').select('id,reviewer_id,reviewer_role,rating,comment,created_at').eq('job_id',id);reviewError=!!r.error;reviews=r.data}
 const ownReview=reviews?.find(x=>x.reviewer_id===user.id&&x.reviewer_role===manageRole)
 const received=reviews?.find(x=>x.reviewer_id===otherId&&x.reviewer_role!==manageRole)

 // Conversation: load ONLY the selected thread. Side panel once there is an accepted
 // counterpart; inline under the selected offer before acceptance.
 let convPerson:string|null=null,convPlacement:'side'|'inline'|null=null
 if(awarded&&acceptedProviderId){convPerson=own?acceptedProviderId:(isAcceptedProvider?job.requester_id:null);if(convPerson)convPlacement='side'}
 else if(job.status==='open'){
   if(own&&threadParam&&offers?.some(b=>b.provider_id===threadParam&&b.status!=='rejected'))convPerson=threadParam,convPlacement='inline'
   else if(!own&&myOffer)convPerson=job.requester_id,convPlacement='inline'
 }
 let conversation=null
 if(convPerson){try{conversation=await loadConversation(supabase,user.id,{kind:'job',id,person:convPerson})}catch{}}
 const twoCol=convPlacement==='side'&&!!conversation

 // Compact timeline — only steps with real data; no invented timestamps.
 const timeline:string[]=['Posted '+nzDate(job.created_at)]
 if(questions?.length)timeline.push(questions.length+(questions.length===1?' question':' questions'))
 if(own&&offers?.length)timeline.push(offers.length+(offers.length===1?' offer':' offers'))
 if(awarded&&acceptedProviderId)timeline.push('Offer accepted')
 if(job.status==='completed')timeline.push('Completed')
 if(received||ownReview)timeline.push('Reviewed')

 const detailsCard=<article className="card work-detail"><p>{job.category} · {job.location_area || job.location_name || 'Location to be arranged'}</p><p className="work-description">{job.description}</p>{acceptedOffer&&job.status!=='cancelled'
   ? <><strong>{'Agreed: '+(acceptedOffer.amount?formatOfferAmount(acceptedOffer.amount,acceptedOffer.pricing_type):'price to be confirmed')}</strong><p className="muted">{'Posted as: '+(job.price_type==='fixed'?'Budget '+nzMoney(job.price):'open to offers')}</p></>
   : <strong>{job.price_type==='fixed'?"Budget: "+nzMoney(job.price)+'':'Open to offers'}</strong>}<p>{schedule}</p><p className="muted">Posted by <Link href={'/people/'+job.requester_id} className="card-link">{names.get(job.requester_id) || 'a community member'}</Link></p>
   {job.location_name&&<p>Property location: {job.location_name}</p>}{job.location_note&&<p className="work-description">Location note: {job.location_note}</p>}
   {mapTarget&&<a className="card-link" href={mapTarget.href} target="_blank" rel="noopener noreferrer">{mapTarget.label}</a>}
   {job.hide_exact_location&&<p className="muted">The exact property location, GPS and location note are shared with the accepted provider.</p>}
   {job.materials_type&&<p>Materials: {MATERIALS[job.materials_type as keyof typeof MATERIALS] || job.materials_type}</p>}
   {job.access_conditions?.length>0&&<p>Site access: {job.access_conditions.map((a:string)=>ACCESS[a as keyof typeof ACCESS] || a).join(', ')}</p>}
   {job.photos?.length>0&&<div className="job-photo-grid">{job.photos.map((url:string,i:number)=><a key={url} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={'Job photo '+(i+1)}/></a>)}</div>}
   <p className="muted">Agree scope, timing and payment directly. Rural Connections does not handle payments.</p>
  </article>

 const qaSection=<section className="card"><h2 id="questions" tabIndex={-1} style={{scrollMarginTop:96}}>Questions & answers</h2><p className="muted">Questions and answers are public. Keep phone numbers, exact addresses and other private details out of them.</p>{questionError?<p role="alert">Could not load questions. Refresh to try again.</p>:<>{!questions?.length&&<p>No questions yet.</p>}{questions?.map(q=><article className="work-offer" key={q.id} id={'question-'+q.id} tabIndex={-1} style={{scrollMarginTop:96}}><h3>{names.get(q.asker_id) || 'Community member'} asks</h3><p className="work-description">{q.question}</p>{q.answer&&<div className="account-current"><strong>Requester&apos;s answer</strong><p className="work-description">{q.answer}</p></div>}{own&&job.status==='open'&&<details className="activity-action"><summary>{q.answer?'Edit answer':'Answer question'}</summary><ActionForm action={jobQuestion} label="Save answer"><input type="hidden" name="job_id" value={id}/><input type="hidden" name="question_id" value={q.id}/><label className="lform-field">Public answer<textarea name="answer" rows={3} maxLength={2000} required defaultValue={q.answer || ''}/></label></ActionForm></details>}</article>)}{canAskQuestion&&<ActionForm action={jobQuestion} label="Post question"><input type="hidden" name="job_id" value={id}/><label className="lform-field">Your question{job.visibility==='public'&&<small id="question-visibility" className="muted">Your question and the reply are visible to anyone who can view this job</small>}<textarea aria-describedby={job.visibility==='public'?'question-visibility':undefined} name="question" rows={3} maxLength={2000} required/></label></ActionForm>}</>}</section>

 const offersSection=offerError?<p role="alert" className="card">Could not load offers. Refresh to try again.</p>:<section className="card" id="offer"><h2>{own?'Offers':myOffer?'Your offer':'Send an offer'}</h2>
   {own&&!offers?.length&&<p className="muted">Offers will appear here when people respond.</p>}
   {offers?.map(b=><article className="work-offer" key={b.id} id={'offer-'+b.id} style={{scrollMarginTop:96}}><h3>{own?<Link href={'/people/'+b.provider_id} className="card-link">{names.get(b.provider_id) || 'Provider'}</Link>:'Your offer'} · {formatOfferAmount(b.amount,b.pricing_type)}</h3><p className="work-description">{b.message}</p><p>{b.status==='pending'?'Awaiting response':b.status==='rejected'?'Not selected':statusLabel(b.status)}</p>{b.line_items?.length>0&&<ul>{b.line_items.map((item:{label:string;amount:number},i:number)=><li key={i}>{item.label}: {nzMoney(item.amount)}</li>)}</ul>}{b.materials&&<p>{OFFER_MATERIALS_LABELS[b.materials as keyof typeof OFFER_MATERIALS_LABELS] || b.materials}</p>}{b.available_from&&<p>Available from: {nzDate(b.available_from)}</p>}{b.estimated_duration&&<p>Estimated duration: {b.estimated_duration}</p>}
    {own&&job.status==='open'&&b.status!=='rejected'&&<Link className="card-link" href={'/jobs/'+id+'?thread='+b.provider_id+'#offer-'+b.id}>Message {names.get(b.provider_id)?.trim().split(/\s+/)[0] || 'this provider'}</Link>}
    {job.status==='open'&&b.status==='pending'&&(own?<details className="activity-action"><summary>Accept this offer</summary><ActionForm action={acceptOffer} label="Accept offer"><input type="hidden" name="offer_id" value={b.id}/><p>Accepting awards this job to {names.get(b.provider_id) || 'this provider'} and declines the other pending offers. The accepted provider can see the exact location.</p><label className="account-setting"><input type="checkbox" required/>I agree to accept this offer.</label></ActionForm></details>:<>
     <details className="activity-action"><summary>Edit your offer</summary><OfferForm jobId={id} offer={b} providerMaterials={job.materials_type==='provider'}/></details>
     <details className="activity-action"><summary>Withdraw offer</summary><ActionForm action={changeOffer} label="Withdraw offer"><input type="hidden" name="offer_id" value={b.id}/><input type="hidden" name="intent" value="withdraw"/><p>This removes your pending offer. You can send a new offer while the job is open.</p><label className="account-setting"><input type="checkbox" name="confirmed" required/>I want to withdraw this offer.</label></ActionForm></details></>)}
    {convPlacement==='inline'&&conversation&&convPerson===b.provider_id&&<div className="work-inline-chat"><Conversation compact context={conversation}/></div>}
   </article>)}
   {!own&&!myOffer&&job.status==='open'&&<OfferForm jobId={id} providerMaterials={job.materials_type==='provider'}/>}
   {!own&&!myOffer&&job.status!=='open'&&<p>This job is no longer accepting offers.</p>}
  </section>

 const invitedSection=own?<section className="card"><h2>Invited providers</h2>{sentInviteError?<p role="alert">Could not load invitations. Refresh to try again.</p>:sentInvites?.length?sentInvites.map(i=><p key={i.id}><Link href={'/people/'+i.provider_id} className="card-link">{names.get(i.provider_id) || 'Previous provider'}</Link> · {offers?.some(b=>b.provider_id===i.provider_id)?'Offer received':i.status==='declined'?'Invitation declined':i.status==='seen'?'Opened — awaiting an offer':'Invitation sent'}</p>):<p className="muted">No providers invited yet.</p>}{job.status==='open'&&<Link href="/connections" className="card-link">Invite a previous provider →</Link>}</section>:null

 const mainColumn=<>
  {next&&<div className={'work-nextstep'+(next.needsAction?' needs-action':'')}><strong>{next.label}</strong><span>{next.detail}</span></div>}
  {job.visibility==='invite_only'&&<p className="account-current">Private invited job — visible to the requester and invited providers.</p>}
  {job.status==='open'&&!own&&(watchError?<p role="alert">Could not check saved-job status. Refresh before saving.</p>:<ActionForm action={saveWatchedJob} label={watched?'Remove saved job':'Save job'}><input name="job_id" type="hidden" value={id}/><input name="intent" type="hidden" value={watched?'remove':'save'}/></ActionForm>)}
  {own&&job.status==='open'&&<Link href="/connections" className="card-link">Invite a previous provider from Connections →</Link>}
  {detailsCard}
  {!!timeline.length&&<p className="work-timeline muted">{timeline.join(' · ')}</p>}
  <div className="lform-actions">{own&&ownerActions.edit&&<Link className="lform-cancel" href={'/jobs/'+id+'/edit'}>Edit job</Link>}{own&&ownerActions.repeat&&<Link className="lform-cancel" href={'/jobs/new?repeat='+id}>Repeat this job</Link>}{actions.filter(a=>a!=='review').length>0&&<a className="lform-cancel" href="#manage">Manage this job</a>}{canAskQuestion&&<a className="lform-cancel" href="#questions">Ask a question</a>}{job.status==='open'&&<ShareJob title={job.title} publicJob={job.visibility==='public'&&job.status==='open'}/>}</div>
  {job.status==='open'?<>{qaSection}{offersSection}{invitedSection}</>:<details className="card work-earlier"><summary>Earlier questions &amp; offers</summary>{qaSection}{offersSection}{invitedSection}</details>}
  <ManageActions kind="job" id={id} actions={actions} otherFirst={otherFirst}/>
  {job.status==='completed'&&<ReviewsSection kind="job" id={id} actions={actions} personName={(otherId?names.get(otherId):null) || null} received={received} ownReview={ownReview} reviewError={reviewError}/>}
  {job.status==='completed'&&<p className="home-clear">Job complete. You can find it again in History.</p>}
  {own&&ownerActions.delete&&<details className="card activity-action"><summary>Delete job</summary><ActionForm action={removeJob} label="Permanently delete job"><input type="hidden" name="job_id" value={id}/><p>This permanently deletes the job and its offers, messages, questions and associated records. It cannot be undone.</p><label className="account-setting"><input type="checkbox" name="confirmed" required/>I want to permanently delete this job.</label></ActionForm></details>}
 </>

 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/jobs" className="card-link">Back to Jobs</Link><header className="home-heading"><div><p className="eyebrow">{statusLabel(job.status)}</p><h1>{job.title}</h1></div><LiveRefresh/></header>
  {twoCol?<div className="work-workspace"><div className="work-main">{mainColumn}</div><aside className="work-conversation" id="conversation"><Conversation compact context={conversation!}/></aside></div>:mainColumn}
 </section></AppShell>
}
