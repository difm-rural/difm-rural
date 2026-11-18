// Direct job offers a provider has received (Connections Phase 2).
import { supabase } from './supabase'
import { allRows } from '../../shared/relationshipHistory'
import { ACTIVE_JOB_INVITATIONS, invitationLabel } from '../../shared/jobInvitations'

export function sendJobInvitation(jobId,providerId,revision){
  return revision==null
    ?supabase.rpc('invite_connection_to_job',{p_job_id:jobId,p_provider_id:providerId})
    :supabase.rpc('reinvite_to_job',{p_job_id:jobId,p_provider_id:providerId,p_revision:revision})
}

export function respondToJobInvitation(invite,action){
  return supabase.rpc('respond_job_invitation',{p_invite:invite.id,p_revision:invite.revision,p_action:action})
}

// Open jobs the given provider has been privately invited to, newest first.
// Each row carries the embedded `job` and the inviting `requester` profile.
export async function fetchInvitedJobsForProvider(uid) {
  if (!uid) return []
  let rows
  try{
    const invites=await allRows(()=>supabase.from('job_invites')
      .select('id,status,sent_at,job_id').eq('provider_id',uid).in('status',ACTIVE_JOB_INVITATIONS)
      .order('sent_at',{ascending:false}).order('id'))
    const jobs=new Map()
    for(let i=0;i<invites.length;i+=200){
      const {data,error}=await supabase.from('jobs_public').select('*')
        .in('id',invites.slice(i,i+200).map(item=>item.job_id)).eq('status','open')
      if(error)throw error
      data?.forEach(job=>jobs.set(job.id,job))
    }
    rows=invites.filter(item=>jobs.has(item.job_id)).map(item=>({...item,created_at:item.sent_at,job:jobs.get(item.job_id)}))
  }catch{return []}
  if (rows.length === 0) return []

  const requesterIds = [...new Set(rows.map(r => r.job.requester_id).filter(Boolean))]
  const { data: profiles } = await supabase
    .from('profiles_public')
    .select('id, full_name, avatar_url')
    .in('id', requesterIds)
  const pmap = {}
  profiles?.forEach(p => { pmap[p.id] = p })

  return rows.map(r => ({ ...r, requester: pmap[r.job.requester_id] || null }))
}

export async function countInvitedJobsForProvider(uid) {
  const rows = await fetchInvitedJobsForProvider(uid)
  return rows.length
}

// Requester side: who a job has been offered to, and where each stands.
// Each row carries the provider profile and a `hasOffered` flag (derived from
// whether they've placed a live bid).
export async function fetchInvitesForJob(jobId) {
  if (!jobId) return []
  const { data: invites } = await supabase
    .from('job_invites')
    .select('id, provider_id, status, revision, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  if (!invites?.length) return []

  const providerIds = [...new Set(invites.map(i => i.provider_id))]
  const [{ data: profiles }, { data: bids }] = await Promise.all([
    supabase.from('profiles_public').select('id, full_name, avatar_url').in('id', providerIds),
    supabase.from('bids').select('provider_id, status').eq('job_id', jobId).in('provider_id', providerIds),
  ])
  const pmap = {}
  profiles?.forEach(p => { pmap[p.id] = p })
  const offered = new Set((bids || []).filter(b => b.status !== 'rejected').map(b => b.provider_id))

  return invites.map(i => ({
    ...i,
    provider: pmap[i.provider_id] || null,
    hasOffered: offered.has(i.provider_id),
  }))
}

// Human label for the requester's "Offered to" list.
export function inviteStatusLabel(invite) {
  return invitationLabel(invite.status)+(invite.hasOffered?' · Offer received':'')
}
