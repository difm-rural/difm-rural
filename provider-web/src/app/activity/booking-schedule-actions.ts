'use server'
import {revalidatePath} from 'next/cache'
import {requireProvider} from '@/lib/auth'
import type {ActionState} from '@/components/action-form'
export async function saveBookingSchedule(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider(),id=String(data.get('booking_id') || ''),intent=String(data.get('intent') || '')
 const {data:b,error}=await supabase.from('bookings').select('requester_id,provider_id,status,service:services(kind)').eq('id',id).single()
 const service=Array.isArray(b?.service)?b.service[0]:b?.service
 if(error||!b||![b.provider_id,b.requester_id].includes(user.id)||!['confirmed','in_progress'].includes(b.status)||service?.kind==='grazing')return {error:'This booking has changed or scheduling is unavailable. Refresh and try again.'}
 if(intent==='arrival'){
  if(user.id!==b.provider_id)return {error:'Only the provider can set the shared arrival window.'}
  const start=new Date(String(data.get('start'))),end=new Date(String(data.get('end'))),finish=new Date(String(data.get('finish')))
  if([start,end,finish].some(d=>Number.isNaN(d.getTime()))||start<=new Date()||end<=start||end.getTime()-start.getTime()>86400000||finish<end||finish.getTime()-start.getTime()>7*86400000)return {error:'Choose a future arrival window of up to 24 hours and an expected finish within seven days.'}
  const result=await supabase.rpc('set_work_arrival_window',{p_job_id:null,p_booking_id:id,p_start:start.toISOString(),p_end:end.toISOString(),p_expected_complete:finish.toISOString()})
  if(result.error)return {error:'Could not save the arrival window. Refresh the booking status and try again.'}
 }else if(intent==='late'){
  const minutes=Number(data.get('minutes'));if(![15,30].includes(minutes))return {error:'Choose a 15 or 30 minute delay.'}
  const result=await supabase.rpc('send_running_late_notice',{p_job_id:null,p_booking_id:id,p_minutes:minutes})
  if(result.error)return {error:'Could not send the update. Check that an arrival window exists and that you have not sent a notice in the last 15 minutes.'}
 }else return {error:'Choose a schedule action.'}
 revalidatePath('/activity/booking/'+id+'/manage');revalidatePath('/activity');revalidatePath('/')
 return {error:'',success:intent==='arrival'?'Arrival window saved. The requester has been notified.':'Delay update sent to the other person.'}
}
