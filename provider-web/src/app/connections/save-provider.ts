'use server'

import { revalidatePath } from 'next/cache'
import { requireProvider } from '@/lib/auth'
import { validId } from '@/lib/job-input'
import { setProviderSaved } from '@shared/trustedLocals'
import type { ActionState } from '@/components/action-form'

export async function saveProvider(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider('/connections?view=locals')
 const provider=String(data.get('provider_id') || '')
 const intent=data.get('intent')
 if(!validId(provider)||provider===user.id||(intent!=='save'&&intent!=='remove'))return {error:'Choose an available provider.'}
 try{await setProviderSaved(supabase,user.id,provider,intent==='save')}
 catch{return {error:'Could not update My People. Try again.'}}
 revalidatePath('/connections')
 revalidatePath('/people/'+provider)
 return {error:'',success:intent==='save'?'Saved to My People.':'Removed from My People.'}
}
