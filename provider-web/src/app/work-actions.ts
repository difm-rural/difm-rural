'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireProvider } from '@/lib/auth'
import { JOB_EDITOR_COLUMNS, jobInput, jobOwnerActions, validId, type JobSeed } from '@/lib/job-input'
import type { ActionState } from '@/components/action-form'
import { offerInput } from '@/lib/offer-input'
import { bookingEstimate } from '@/lib/booking-estimate'

const text = (data: FormData, name: string) => String(data.get(name) || '').trim()
const failed = (): ActionState => ({ error: 'Could not save. Check your connection, refresh this page and try again.' })

export async function postJob(_: ActionState, data: FormData): Promise<ActionState & {jobId?:string}> {
  return saveJob(data,false)
}
export async function editJob(_: ActionState,data:FormData):Promise<ActionState & {jobId?:string}>{return saveJob(data,true)}
async function saveJob(data:FormData,editing:boolean):Promise<ActionState & {jobId?:string}>{
  const {supabase,user}=await requireProvider(),id=text(data,'job_id'),source=text(data,'repeated_from_job_id')
  if(!validId(id) || (source&&!validId(source)))return {error:'This draft reference is invalid. Start a new job from Jobs.'}
  let current:(JobSeed & {area_polygon:unknown;area_hectares:number|null})|null=null
  if(editing || source){
    const {data:job,error}=await supabase.from('jobs').select(JOB_EDITOR_COLUMNS).eq('id',editing?id:source).eq('requester_id',user.id).single()
    if(error || !job)return {error:'Could not load your job. Refresh and try again.'}
    if(!jobOwnerActions(job.status,0)[editing?'edit':'repeat'])return {error:'This job has changed. Only open jobs can be edited, and closed jobs can be repeated.'}
    current=job as JobSeed & {area_polygon:unknown;area_hectares:number|null}
  }
  const input=jobInput(data,{userId:user.id,jobId:id,baseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL || '',existingPhotos:current?.photos || [],existingAccess:current?.access_conditions || []})
  if(!input.ok)return {error:input.error}
  const moved=!!current && (input.value.location_name!==current.location_name || input.value.latitude!==current.latitude || input.value.longitude!==current.longitude)
  const areaPatch=moved?{area_polygon:null,area_hectares:null}:{}
  if(editing){
    const {data:rows,error}=await supabase.from('jobs').update({...input.value,...areaPatch}).eq('id',id).eq('requester_id',user.id).eq('status','open').select('id')
    if(error || !rows?.length)return {error:'Could not save. The job may have changed or been accepted. Your changes remain in the form; refresh its status before retrying.'}
  }else{
    // A retry uses the same draft id, so a lost response cannot create a second job.
    const {data:existing,error:lookupError}=await supabase.from('jobs').select('id').eq('id',id).eq('requester_id',user.id).maybeSingle()
    if(lookupError)return failed()
    if(!existing){
      const {error}=await supabase.from('jobs').insert({...input.value,area_polygon:!moved?current?.area_polygon || null:null,area_hectares:!moved?current?.area_hectares ?? null:null,id,requester_id:user.id,status:'open',visibility:'public',recurrence_frequency:'one_time',repeated_from_job_id:source || null})
      if(error)return failed()
    }
  }
  for(const path of ['/','/jobs','/jobs/'+id,'/activity','/activity/job/'+id+'/manage'])revalidatePath(path)
  return {error:'',jobId:id}
}

export async function removeJob(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider(),id=text(data,'job_id')
 if(!validId(id) || data.get('confirmed')!=='on')return {error:'Confirm that you want to permanently delete this job.'}
 const {data:job,error}=await supabase.from('jobs').select('id,status').eq('id',id).eq('requester_id',user.id).single()
 const {count,error:offerError}=await supabase.from('bids').select('id',{count:'exact',head:true}).eq('job_id',id)
 if(error || offerError || !job || !jobOwnerActions(job.status,count ?? 1).delete)return {error:'This job cannot be deleted. Open jobs with offers must be cancelled first. Refresh its status.'}
 const result=await supabase.rpc('delete_managed_job',{p_job_id:id})
 if(result.error)return failed()
 revalidatePath('/');revalidatePath('/activity');revalidatePath('/jobs');redirect('/activity?view=history')
}
export async function changeOffer(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider(),id=text(data,'offer_id'),intent=text(data,'intent')
 const {data:offer,error}=await supabase.from('bids').select('id,job_id,status,provider_id').eq('id',id).eq('provider_id',user.id).single()
 if(error || !offer || offer.status!=='pending')return {error:'This offer has changed. Refresh before trying again.'}
 const {data:job,error:jobError}=await supabase.from('jobs_public').select('status,materials_type').eq('id',offer.job_id).single()
 if(jobError || job?.status!=='open')return {error:'This job is no longer accepting changes to offers.'}
 if(!['edit','withdraw'].includes(intent))return {error:'Choose an offer action.'}
 if(intent==='withdraw' && data.get('confirmed')!=='on')return {error:'Confirm that you want to withdraw this offer.'}
 const input=intent==='edit'?offerInput(data,job.materials_type==='provider'):null
 if(input&&!input.ok)return {error:input.error}
 const result=intent==='edit'&&input?.ok?await supabase.rpc('update_pending_job_offer_details',{p_offer_id:id,p_details:input.value}):await supabase.rpc('change_pending_job_offer',{p_offer_id:id,p_intent:'withdraw',p_amount:null,p_message:null})
 if(result.error)return {error:'Could not change your offer. The job may have been accepted or closed. Refresh and try again.'}
 revalidatePath('/jobs/'+offer.job_id);revalidatePath('/activity');return {error:'',success:intent==='withdraw'?'Offer withdrawn.':'Offer updated.'}
}
export async function jobQuestion(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider(),id=text(data,'job_id'),questionId=text(data,'question_id'),content=text(data,questionId?'answer':'question')
 if(!validId(id)||!content||content.length>2000)return {error:'Write a question or answer of up to 2,000 characters.'}
 const {data:job,error}=await supabase.from('jobs_public').select('id,status,requester_id').eq('id',id).single()
 if(error || !job || job.status!=='open')return {error:'This job is no longer open for questions. Refresh its status.'}
 if(questionId){
   if(!validId(questionId)||job.requester_id!==user.id)return {error:'Only the job owner can answer this question.'}
   const result=await supabase.from('job_questions').update({answer:content,answered_by:user.id,answered_at:new Date().toISOString()}).eq('id',questionId).eq('job_id',id).select('id')
   if(result.error || !result.data?.length)return failed()
 }else{
   if(job.requester_id===user.id)return {error:'Use the answer form to reply to a question on your job.'}
   const result=await supabase.from('job_questions').insert({job_id:id,asker_id:user.id,question:content})
   if(result.error)return failed()
 }
 revalidatePath('/jobs/'+id);return {error:'',success:questionId?'Answer saved.':'Question posted.'}
}

export async function sendOffer(_: ActionState, data: FormData): Promise<ActionState> {
  const { supabase, user } = await requireProvider()
  const id = text(data,'job_id')
  const { data: job, error: jobError } = await supabase.from('jobs_public').select('id,requester_id,status,materials_type').eq('id',id).single()
  if (jobError || !job || job.status !== 'open' || job.requester_id === user.id) return {error:'This job is no longer accepting your offers. Refresh to see its current status.'}
  const input=offerInput(data,job.materials_type==='provider')
  if(!input.ok)return {error:input.error}
  const existing = await supabase.from('bids').select('id').eq('job_id',id).eq('provider_id',user.id).in('status',['pending','accepted'])
  if (existing.error) return failed()
  if (existing.data?.length) return {error:'You already have an offer on this job. You can track it in Activity.'}
  const { error } = await supabase.from('bids').insert({...input.value,job_id:id,provider_id:user.id,status:'pending'})
  if (error) return failed()
  revalidatePath('/')
  redirect('/activity')
}

export async function acceptOffer(_: ActionState, data: FormData): Promise<ActionState> {
  const { supabase, user } = await requireProvider()
  const id=text(data,'offer_id')
  const { data: bid, error } = await supabase.from('bids').select('id,job_id').eq('id',id).single()
  if(error || !bid) return failed()
  const {data:job}=await supabase.from('jobs').select('requester_id,status').eq('id',bid.job_id).single()
  if(!job || job.requester_id !== user.id || job.status !== 'open') return {error:'This job is no longer accepting offers.'}
  const result=await supabase.rpc('accept_job_offer',{p_offer_id:id})
  if(result.error) return failed()
  revalidatePath('/')
  redirect('/jobs/'+bid.job_id)
}

export async function requestBooking(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider()
  const id=text(data,'service_id'), location=text(data,'location'), quantity=Number(text(data,'quantity'))
  if(!location || !Number.isFinite(quantity) || quantity<=0)return {error:'Add a location and a positive quantity.'}
  const {data:s,error}=await supabase.from('services').select('*').eq('id',id).single()
  if(error || !s || !s.is_active || s.closed_at || s.provider_id===user.id || ['for_sale','lease'].includes(s.kind))return {error:'This listing is unavailable for booking requests. Refresh and try again.'}
  const existing=await supabase.from('bookings').select('id').eq('service_id',id).eq('requester_id',user.id).in('status',['pending','quote_sent','confirmed','in_progress','cancellation_requested'])
  if(existing.error)return failed()
  if(existing.data?.length)return {error:'You already have an active request for this listing. Open Activity to view it.'}
  const estimate=bookingEstimate(s,quantity)
  const {error:saveError}=await supabase.from('bookings').insert({service_id:id,provider_id:s.provider_id,requester_id:user.id,status:'pending',quantity:estimate.quantity,total_amount:estimate.amount ?? 0,payment_timing:s.payment_timing,location_name:location,scheduled_date:text(data,'date') || 'flexible',notes:text(data,'notes') || null})
  if(saveError)return failed()
  revalidatePath('/')
  redirect('/activity')
}

export async function respondBooking(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider();const id=text(data,'booking_id'),intent=text(data,'intent')
  const {data:b,error}=await supabase.from('bookings').select('*,service:services(pricing_type)').eq('id',id).single()
  if(error || !b)return failed()
  const provider=b.provider_id===user.id,requester=b.requester_id===user.id
  let patch:Record<string,unknown>={}
  if(provider && b.status==='pending' && intent==='confirm' && b.service?.pricing_type!=='quote_required')patch={status:'confirmed'}
  else if(provider && b.status==='pending' && intent==='quote'){
    const amount=Number(text(data,'amount'));if(!Number.isFinite(amount)||amount<=0)return {error:'Enter a positive quote amount.'}
    patch={status:'quote_sent',quote_amount:amount,quote_notes:text(data,'notes') || null,quote_sent_at:new Date().toISOString()}
  }
  else if(provider && ['pending','quote_sent'].includes(b.status) && intent==='decline')patch={status:'cancelled'}
  else if(provider && b.status==='cancellation_requested' && intent==='cancel')patch={status:'cancelled'}
  else if(requester && b.status==='quote_sent' && intent==='accept')patch={status:'confirmed',quote_accepted_at:new Date().toISOString()}
  else return {error:'This request has changed. Refresh to see its current state.'}
  const result=await supabase.from('bookings').update(patch).eq('id',id).eq('status',b.status).select('id')
  if(result.error || !result.data?.length)return failed()
  revalidatePath('/');revalidatePath('/activity');return {error:''}
}
