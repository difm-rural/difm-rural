'use server'
import { revalidatePath } from 'next/cache'
import { requireProvider } from '@/lib/auth'
import type { ActionState } from '@/components/action-form'
import { availabilityInput } from '@/lib/profile-input'

function refreshed(){revalidatePath('/notifications');revalidatePath('/');revalidatePath('/activity')}

export async function updateNotification(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider()
  const id=String(data.get('id') || ''),all=data.get('all')==='true',cutoff=String(data.get('cutoff') || '')
  if(all && (!cutoff || Number.isNaN(Date.parse(cutoff))))return {error:'Refresh the notification list before trying again.'}
  if(!all){
    const {data:n,error}=await supabase.from('notifications').select('id,read').eq('id',id).eq('user_id',user.id).maybeSingle()
    if(error || !n)return {error:'This notification is unavailable. Refresh to try again.'}
    if(n.read)return {error:'',success:'Already read.'}
  }
  let q=supabase.from('notifications').update({read:true}).eq('user_id',user.id).eq('read',false)
  q=all?q.lte('created_at',cutoff):q.eq('id',id)
  const {error}=await q
  if(error)return {error:'Could not update notifications. Check your connection and try again.'}
  refreshed()
  return {error:'',success:all?'Notifications marked read.':'Marked read.'}
}

// Fired in the background when a row is opened, and by the row's "Mark read"
// button. Message notices are excluded here too: the conversation marks them
// read once its messages have loaded.
export async function markNotificationRead(id:string,options:{includeMessages?:boolean}={}):Promise<{ok:boolean}>{
  const {supabase,user}=await requireProvider()
  if(!id)return {ok:false}
  let q=supabase.from('notifications').update({read:true}).eq('id',id).eq('user_id',user.id).eq('read',false)
  if(!options.includeMessages)q=q.neq('type','new_message')
  const {error}=await q
  if(error)return {ok:false}
  refreshed()
  return {ok:true}
}

const QUICK_AVAILABILITY=new Set(['available_this_week','limited'])

// The inline answers on an availability_check notice (mirrors the app's
// NotificationsScreen quick actions): save the status, then mark the notice read.
export async function answerAvailabilityCheck(id:string,status:string):Promise<ActionState>{
  if(!QUICK_AVAILABILITY.has(status))return {error:'Choose an availability option.'}
  const {supabase,user}=await requireProvider()
  const form=new FormData();form.set('availability_status',status)
  const input=availabilityInput(form)
  if(!input.ok)return {error:input.error}
  const {data:rows,error}=await supabase.from('profiles').update(input.value).eq('id',user.id).select('id')
  if(error || !rows?.length)return {error:'Could not save availability. Check your connection and try again.'}
  await supabase.from('notifications').update({read:true}).eq('id',id).eq('user_id',user.id)
  refreshed();revalidatePath('/account');revalidatePath('/account/availability')
  return {error:''}
}
