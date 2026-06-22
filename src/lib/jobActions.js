// Job + bid mutations — one implementation each, with the right RLS/state
// guards baked in. Screens import these and keep their own UI (alerts, modals,
// navigation, local state). Each returns the Supabase result ({ data, error })
// unless noted.

import { supabase } from './supabase'
import { JOB_STATUS } from './lifecycle'

// Provider flags the job done; requester then confirms.
// (The "accepted provider can mark awaiting_completion" RLS policy enforces who.)
export function markJobComplete(jobId) {
  return supabase
    .from('jobs')
    .update({ status: JOB_STATUS.AWAITING_COMPLETION })
    .eq('id', jobId)
    .select()
    .single()
}

// Requester confirms the work is done -> closes the job.
export function confirmJobComplete(jobId, requesterId) {
  return supabase
    .from('jobs')
    .update({ status: JOB_STATUS.COMPLETED })
    .eq('id', jobId)
    .eq('requester_id', requesterId)
}

// Requester cancels their job (any non-terminal state).
export function cancelJob(jobId, requesterId, { reason, note } = {}) {
  return supabase
    .from('jobs')
    .update({ status: JOB_STATUS.CANCELLED, cancellation_reason: reason, cancellation_note: note })
    .eq('id', jobId)
    .eq('requester_id', requesterId)
}

// Requester deletes their job.
export function deleteJob(jobId, requesterId) {
  return supabase.from('jobs').delete().eq('id', jobId).eq('requester_id', requesterId)
}

// Requester accepts a bid: mark it accepted, reject the others, award the job.
// Returns { error } — the first failing step short-circuits.
export async function acceptBid(job, bid) {
  const { error: acceptError } = await supabase.from('bids').update({ status: 'accepted' }).eq('id', bid.id)
  if (acceptError) return { error: acceptError }

  await supabase.from('bids').update({ status: 'rejected' }).eq('job_id', job.id).neq('id', bid.id)

  const { error: awardError } = await supabase
    .from('jobs')
    .update({ status: JOB_STATUS.ACCEPTED })
    .eq('id', job.id)
  return { error: awardError || null }
}
