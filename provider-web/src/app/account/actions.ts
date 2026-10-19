'use server'
import { revalidatePath } from 'next/cache'
import { requireProvider } from '@/lib/auth'
import { profileInput, availabilityInput, preferencesInput } from '@/lib/profile-input'
import type { ActionState } from '@/components/action-form'
function refreshed(id:string){
  for(const path of ['/account','/account/profile','/account/availability','/','/people/'+id,'/people/'+id+'/reviews','/messages'])revalidatePath(path)
}
export async function saveProfile(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider()
  const {data:current,error:loadError}=await supabase.from('profiles').select('avatar_url,skills').eq('id',user.id).single()
  if(loadError || !current)return {error:'Could not load your profile. Refresh and try again.'}
  const input=profileInput(data,current,user.id,process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  if(!input.ok)return {error:input.error}
  const {data:rows,error}=await supabase.from('profiles').update(input.value).eq('id',user.id).select('id')
  if(error || !rows?.length)return {error:'Could not save your profile. Your changes are still in the form. Check your connection and try again.'}
  refreshed(user.id);return {error:'',success:'Profile saved. Your public name, photo, region, bio and capabilities are visible to other members.'}
}
export async function saveAvailability(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider(),input=availabilityInput(data)
  if(!input.ok)return {error:input.error}
  const {data:rows,error}=await supabase.from('profiles').update(input.value).eq('id',user.id).select('id')
  if(error || !rows?.length)return {error:'Could not save availability. Refresh and try again.'}
  refreshed(user.id);return {error:'',success:'Availability updated in the app and web console.'}
}
export async function saveNotificationPreferences(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider(),input=preferencesInput(data)
  if(!input.ok)return {error:input.error}
  const {data:rows,error}=await supabase.from('user_preferences').upsert({user_id:user.id,...input.value},{onConflict:'user_id'}).select('user_id')
  if(error || !rows?.length)return {error:'Could not save notification preferences. Your selections are still in the form. Try again.'}
  revalidatePath('/account/notifications');return {error:'',success:'Notification preferences saved for the app and web console.'}
}
