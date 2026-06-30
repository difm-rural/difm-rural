// Direct job offers a provider has received (Connections Phase 2).
import { supabase } from './supabase'

// Open jobs the given provider has been privately invited to, newest first.
// Each row carries the embedded `job` and the inviting `requester` profile.
export async function fetchInvitedJobsForProvider(uid) {
  if (!uid) return []
  const { data, error } = await supabase
    .from('job_invites')
    .select('id, status, created_at, job:job_id(*)')
    .eq('provider_id', uid)
    .order('created_at', { ascending: false })
  if (error || !data) return []

  // Only open jobs the provider hasn't declined.
  const rows = data.filter(r => r.job && r.job.status === 'open' && r.status !== 'declined')
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
    .select('id, provider_id, status, created_at')
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
  if (invite.hasOffered) return 'Made an offer'
  if (invite.status === 'declined') return 'Declined'
  if (invite.status === 'seen') return 'Opened — no reply yet'
  return 'Not yet opened'
}
