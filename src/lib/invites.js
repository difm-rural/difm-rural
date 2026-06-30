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

  // Only invites whose job still exists and is open (still offerable).
  const rows = data.filter(r => r.job && r.job.status === 'open')
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
