'use server'
import {cookies} from 'next/headers'
import {revalidatePath} from 'next/cache'
import {requireProvider} from '@/lib/auth'
import {coordinates,savedSearchInput} from '@/lib/discovery'
import {browsingOrigin} from '@/lib/browsing-origin'
import {ownedInterest} from '@/lib/discovery-data'
import {validId} from '@/lib/job-input'
import type {ActionState} from '@/components/action-form'
export async function setBrowsingLocation(latitude:number|null,longitude:number|null){
 const {user}=await requireProvider(),jar=await cookies()
 if(latitude===null&&longitude===null){jar.delete('rural-browse-location');return {error:''}}
 const point=coordinates(latitude,longitude);if(!point)return {error:'Could not read this location. Try again.'}
 jar.set('rural-browse-location',JSON.stringify({...point,userId:user.id}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:6*3600})
 return {error:''}
}
export async function saveWatchedJob(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider(),id=String(data.get('job_id') || ''),remove=data.get('intent')==='remove'
 if(!validId(id))return {error:'Reopen the job and try again.'}
 if(!remove){const {data:job,error}=await supabase.from('jobs_public').select('id').eq('id',id).maybeSingle();if(error||!job)return {error:'This job is unavailable. Refresh before saving.'}}
 const result=remove?await supabase.from('watchlist').delete().eq('user_id',user.id).eq('job_id',id):await supabase.from('watchlist').upsert({user_id:user.id,job_id:id},{onConflict:'user_id,job_id'})
 if(result.error)return {error:'Could not update saved jobs. Check your connection and try again.'}
 revalidatePath('/jobs');revalidatePath('/jobs/saved');revalidatePath('/jobs/'+id)
 return {error:'',success:remove?'Removed from saved jobs.':'Job saved.'}
}
export async function saveSearch(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider()
 try{
  let origin=(await browsingOrigin(supabase,user.id)).point
  const source=String(data.get('source_interest') || '')
  if(source){if(!validId(source))return {error:'Reopen the saved search and try again.'};const saved=await ownedInterest(supabase,user.id,source);if(!saved)return {error:'This saved search is unavailable.'};origin=coordinates(saved.latitude,saved.longitude)}
  const input=savedSearchInput(data,origin);if(!input.ok)return {error:input.error}
  const {error}=await supabase.from('saved_interests').upsert({user_id:user.id,...input.value},{onConflict:'user_id,filter_key'})
  if(error)throw error
  revalidatePath('/account/interests');return {error:'',success:'Search saved. Manage it in Account → Saved interests.'}
 }catch{return {error:'Could not save the search. Your selections are still here. Check your connection and try again.'}}
}
export async function manageInterest(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider(),id=String(data.get('id') || ''),intent=String(data.get('intent') || '')
 if(!validId(id)||!['save','remove'].includes(intent))return {error:'Reopen this saved interest.'}
 if(intent==='remove'&&data.get('confirmed')!=='on')return {error:'Confirm that you want to remove this saved interest.'}
 const frequency=String(data.get('frequency') || '')
 if(intent==='save'&&!['off','daily','instant'].includes(frequency))return {error:'Choose a valid alert frequency.'}
 const result=intent==='remove'?await supabase.from('saved_interests').delete().eq('id',id).eq('user_id',user.id).select('id'):await supabase.from('saved_interests').update({frequency,push_enabled:frequency!=='off'&&data.get('push_enabled')==='on',email_enabled:frequency!=='off'&&data.get('email_enabled')==='on',active:data.get('active')==='on',auto_paused_at:null,last_engaged_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id).select('id')
 if(result.error||!result.data?.length)return {error:'Could not update this saved interest. Refresh and try again.'}
 revalidatePath('/account/interests');return {error:'',success:intent==='remove'?'Saved interest removed.':'Saved interest updated.'}
}
