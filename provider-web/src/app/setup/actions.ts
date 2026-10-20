'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireProvider } from '@/lib/auth'
import { setupInput, setupDestination } from '@/lib/first-time'
import type { ActionState } from '@/components/action-form'

export async function finishSetup(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider('/setup',true)
  const input=setupInput(data)
  if(!input.ok)return {error:input.error}
  let failed=false
  try{
    const {data:row,error}=await supabase.from('profiles').update({...input.value,primary_role:'both',role:'provider'}).eq('id',user.id).select('id').single()
    failed=!!error || row?.id!==user.id
  }catch{failed=true}
  if(failed)return {error:'Could not save your setup. Your details are still here. Check your connection and try again.'}
  revalidatePath('/')
  const intent=data.get('intent'),next=setupDestination(data.get('next'))
  redirect(next!=='/'?next:intent==='post_job'?'/jobs/new':intent==='listings'?'/browse':'/')
}
