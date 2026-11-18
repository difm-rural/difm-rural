'use server'
import {revalidatePath} from 'next/cache'
import {redirect} from 'next/navigation'
import {requireProvider} from '@/lib/auth'
import {validId} from '@/lib/job-input'
import type {ActionState} from '@/components/action-form'

export async function inviteConnection(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase}=await requireProvider()
 const [chosenJob,chosenRevision]=String(data.get('job_choice') || '').split('|')
 const jobId=chosenJob||String(data.get('job_id') || ''),person=String(data.get('person_id') || '')
 const revision=Number(chosenRevision || data.get('revision') || 0)
 if(!validId(jobId)||!validId(person)||!Number.isSafeInteger(revision)||revision<0||((chosenJob||!revision)&&data.get('confirmed')!=='on')){
  return {error:'Choose one of your open jobs and confirm the invitation.'}
 }
 const args={p_job_id:jobId,p_provider_id:person}
 const {error}=revision
  ?await supabase.rpc('reinvite_to_job',{...args,p_revision:revision})
  :await supabase.rpc('invite_connection_to_job',args)
 if(error)return {error:'Could not send this invitation. Check that the job is still open and refresh before trying again.'}
 revalidatePath('/connections')
 revalidatePath('/connections/'+person)
 revalidatePath('/jobs/'+jobId)
 return {error:'',success:'Invitation sent.'}
}

export async function respondInvitation(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase}=await requireProvider()
 const id=String(data.get('invite_id') || ''),intent=String(data.get('intent') || '')
 const revision=Number(data.get('revision'))
 if(!validId(id)||!Number.isSafeInteger(revision)||revision<1||!['open','accept','decline','withdraw'].includes(intent)){
  return {error:'Refresh to see the current invitation.'}
 }
 if(intent==='decline'&&data.get('confirmed')!=='on')return {error:'Confirm that you want to decline this invitation.'}
 const {data:job,error}=await supabase.rpc('respond_job_invitation',{
  p_invite:id,p_revision:revision,p_action:intent==='open'?'view':intent,
 })
 if(error||!job)return {error:'Could not update the invitation. Refresh and try again.'}
 revalidatePath('/connections/invitations')
 revalidatePath('/jobs/'+job)
 if(intent==='open')redirect('/jobs/'+job)
 if(intent==='decline')redirect('/connections/invitations')
 const success=intent==='accept'?'Invitation accepted. You can now make an offer.':intent==='withdraw'?'Invitation withdrawn.':'Invitation updated.'
 return {error:'',success}
}
