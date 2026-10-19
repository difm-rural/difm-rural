'use server'
import { revalidatePath } from 'next/cache'
import { requireProvider } from '@/lib/auth'
import { loadActivityWork } from '@/lib/activity-data'
import { workActions, workRole, type WorkAction } from '@/lib/activity-policy'
import type { ActionState } from '@/components/action-form'

const value=(data:FormData,key:string)=>String(data.get(key) || '').trim()
export async function manageArrangement(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider()
  const id=value(data,'id'),kind=value(data,'kind'),intent=value(data,'intent') as WorkAction
  if(!['job','booking'].includes(kind))return {error:'Please reopen this arrangement from Activity.'}
  try {
    const work=await loadActivityWork(supabase,kind as 'job'|'booking',id)
    if(!work || intent==='review' || !workActions(work,user.id).includes(intent))return {error:'This arrangement has changed or this action is unavailable to you. Refresh and try again.'}
    const reason=value(data,'reason'),note=value(data,'note')
    if(['cancel','withdraw','request_cancel'].includes(intent) && !reason)return {error:'Choose a reason before continuing.'}
    if(['close_grazing','relist_grazing'].includes(intent)){
      const {error}=await supabase.rpc('complete_grazing_arrangement',{p_booking_id:id,p_relist:intent==='relist_grazing'})
      if(error)throw error
    }else if(intent==='relist'){
      const {data:rows,error}=await supabase.from('services').update({is_active:true,closed_at:null}).eq('id',work.serviceId!).eq('provider_id',user.id).not('closed_at','is',null).select('id')
      if(error)throw error
      if(!rows?.length)return {error:'The listing has already changed. Refresh to see its current state.'}
    }else{
      const status=intent==='complete'?'completed':intent==='request_cancel'?'cancellation_requested':intent==='withdraw'?'withdrawn':'cancelled'
      const patch={status,...(['cancel','withdraw','request_cancel'].includes(intent)?{cancellation_reason:reason,cancellation_note:note || null}:{})}
      const {data:rows,error}=await supabase.from(kind==='job'?'jobs':'bookings').update(patch).eq('id',id).eq('status',work.status).select('id')
      if(error)throw error
      if(!rows?.length)return {error:'The arrangement has already changed. Refresh to see its current state.'}
    }
    revalidatePath('/');revalidatePath('/activity');revalidatePath('/listings');revalidatePath('/browse')
    revalidatePath('/activity/'+kind+'/'+id+'/manage');revalidatePath('/jobs/'+id)
    return {error:'',success:intent==='request_cancel'?'Cancellation requested. The provider needs to confirm.':intent==='relist'?'Your listing is live again.':'Saved. The arrangement has been updated.'}
  }catch{return {error:'Could not save this change. Check your connection, refresh and try again.'}}
}

export async function reviewArrangement(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider()
  const kind=value(data,'kind'),id=value(data,'id'),rating=Number(value(data,'rating')),comment=value(data,'comment')
  if(!['job','booking'].includes(kind) || !Number.isInteger(rating) || rating<1 || rating>5)return {error:'Choose a rating from 1 to 5.'}
  try{
    const work=await loadActivityWork(supabase,kind as 'job'|'booking',id)
    if(!work || !workActions(work,user.id).includes('review'))return {error:'Reviews are available to the participants after the arrangement is completed.'}
    const role=workRole(work,user.id)!,other=role==='provider'?work.requesterId:work.providerId
    const column=kind==='job'?'job_id':'booking_id'
    const {data:existing,error:loadError}=await supabase.from('reviews').select('id').eq(column,id).eq('reviewer_id',user.id).eq('reviewer_role',role).maybeSingle()
    if(loadError)throw loadError
    const payload={job_id:kind==='job'?id:null,booking_id:kind==='booking'?id:null,reviewer_id:user.id,reviewee_id:other,reviewer_role:role,reviewee_role:role==='provider'?'requester':'provider',rating,comment:comment || null,updated_at:new Date().toISOString()}
    const result=existing?await supabase.from('reviews').update(payload).eq('id',existing.id).eq('reviewer_id',user.id).select('id'):await supabase.from('reviews').insert(payload).select('id')
    if(result.error)throw result.error
    if(!result.data?.length)return {error:'Your review could not be saved. Refresh and try again.'}
    revalidatePath('/activity');revalidatePath('/activity/'+kind+'/'+id+'/manage')
    return {error:'',success:'Your review has been saved.'}
  }catch{return {error:'Could not save your review. Your existing review is unchanged. Refresh and try again.'}}
}
