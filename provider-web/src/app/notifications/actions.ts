'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireProvider } from '@/lib/auth'
import type { ActionState } from '@/components/action-form'
import { notificationHref } from '@/lib/work'

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
  revalidatePath('/notifications');revalidatePath('/');revalidatePath('/messages')
  return {error:'',success:all?'Notifications marked read.':'Marked read.'}
}
export async function visitNotification(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider(),id=String(data.get('id') || '')
  const {data:n,error}=await supabase.from('notifications').select('id,type,body,metadata').eq('id',id).eq('user_id',user.id).maybeSingle()
  if(error)return {error:'Could not open this notification. Try again.'}
  if(!n)return {error:'This notification is no longer available.'}
  const meta=n.metadata || {}
  const target=meta.booking_id?{table:'bookings',id:meta.booking_id}:meta.job_id?{table:'jobs_public',id:meta.job_id}:meta.service_id?{table:'services',id:meta.service_id}:null
  if(target){
    const {data:record,error:targetError}=await supabase.from(target.table).select('id').eq('id',target.id).maybeSingle()
    if(targetError)return {error:'Could not load the related item. Check your connection and try again.'}
    if(!record)return {error:'The related item has been removed or is no longer available. You can mark this notification read.'}
  }
  // Message notices are read by the focused conversation after messages load.
  if(n.type!=='new_message'){
    const {error:readError}=await supabase.from('notifications').update({read:true}).eq('id',id).eq('user_id',user.id)
    if(readError)return {error:'Could not update the read status. Please try again.'}
    revalidatePath('/')
  }
  redirect(notificationHref(n))
}
