'use server'
import {revalidatePath} from 'next/cache'
import {redirect} from 'next/navigation'
import {requireProvider} from '@/lib/auth'
import {validId} from '@/lib/job-input'
import type {ActionState} from '@/components/action-form'
export async function inviteConnection(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase}=await requireProvider(),jobId=String(data.get('job_id') || ''),person=String(data.get('person_id') || '')
 if(!validId(jobId)||!validId(person)||data.get('confirmed')!=='on')return {error:'Choose one of your open jobs and confirm the invitation.'}
 const {error}=await supabase.rpc('invite_connection_to_job',{p_job_id:jobId,p_provider_id:person})
 if(error)return {error:'Could not send this invitation. Check that the job is still open and this person is a previous provider, then try again.'}
 revalidatePath('/connections/'+person);revalidatePath('/jobs/'+jobId)
 return {error:'',success:'Invitation sent, or already sent for this job. The provider can find it in Invitations and Notifications.'}
}
export async function respondInvitation(_:ActionState,data:FormData):Promise<ActionState>{
 const {supabase,user}=await requireProvider(),id=String(data.get('invite_id') || ''),intent=String(data.get('intent') || '')
 if(!validId(id)||!['open','decline'].includes(intent))return {error:'Reopen this invitation.'}
 const {data:invite,error}=await supabase.from('job_invites').select('id,job_id,status').eq('id',id).eq('provider_id',user.id).maybeSingle()
 if(error||!invite||invite.status==='declined')return {error:'This invitation is unavailable. Refresh to see its current state.'}
 const {data:job,error:jobError}=await supabase.from('jobs_public').select('id,status').eq('id',invite.job_id).maybeSingle()
 if(jobError||!job||job.status!=='open')return {error:'This job is no longer open. Refresh your invitations.'}
 if(intent==='decline'&&data.get('confirmed')!=='on')return {error:'Confirm that you want to decline this invitation.'}
 if(intent==='decline'||invite.status==='pending'){
  const result=await supabase.from('job_invites').update({status:intent==='decline'?'declined':'seen'}).eq('id',id).eq('provider_id',user.id).eq('status',invite.status).select('id')
  if(result.error||!result.data?.length)return {error:'Could not update the invitation. Refresh and try again.'}
 }
 revalidatePath('/connections/invitations');revalidatePath('/jobs/'+invite.job_id)
 if(intent==='open')redirect('/jobs/'+invite.job_id)
 return {error:'',success:'Invitation declined.'}
}
