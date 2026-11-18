// Job + bid mutations — one implementation each, with the right RLS/state
// guards baked in. Screens import these and keep their own UI (alerts, modals,
// navigation, local state). Each returns { data, error }.
//
// Every state transition is guarded with `.in('status', allowedFrom)` AND
// checked for "no rows changed". If the row has already moved on (a double-tap,
// or the other party acted first), the update matches nothing and we return a
// friendly `stale` error instead of falsely reporting success — so the UI can
// tell the user to refresh rather than corrupting state.

import { supabase } from './supabase'
import { JOB_STATUS, JOB_ACTIVE_STATUSES } from './lifecycle'

// Awaits a guarded mutation and turns a zero-row result into a stale error.
async function commit(query, staleMessage) {
  const { data, error } = await query.select()
  if (error) return { data: null, error }
  if (!data || data.length === 0) {
    return { data: null, error: { code: 'stale', message: staleMessage } }
  }
  return { data, error: null }
}

// The accepted provider completes the job; the requester can review it.
// RLS restricts this to the accepted provider.
export function markJobComplete(jobId) {
  return commit(
    supabase
      .from('jobs')
      .update({ status: JOB_STATUS.COMPLETED })
      .eq('id', jobId)
      .eq('status', JOB_STATUS.ACCEPTED),
    'This job is no longer accepted — please refresh.'
  )
}

// Requester cancels their job (any non-terminal state).
export function cancelJob(jobId, requesterId, { reason, note } = {}) {
  return commit(
    supabase
      .from('jobs')
      .update({ status: JOB_STATUS.CANCELLED, cancellation_reason: reason, cancellation_note: note })
      .eq('id', jobId)
      .eq('requester_id', requesterId)
      .in('status', JOB_ACTIVE_STATUSES),
    'This job has already been closed — please refresh.'
  )
}

// Requester deletes their job. Blocked while a provider is actively engaged
// (accepted) — deleting then would orphan their work, so the owner must cancel
// (which notifies the provider) first.
// Open and finished (cancelled/completed) jobs can still be removed.
export function deleteJob(jobId, requesterId) {
  return commit(
    supabase
      .from('jobs')
      .delete()
      .eq('id', jobId)
      .eq('requester_id', requesterId)
      .in('status', [JOB_STATUS.OPEN, JOB_STATUS.CANCELLED, JOB_STATUS.COMPLETED]),
    'This job has an accepted provider — cancel it first, then delete.'
  )
}

// The database locks the job and chosen offer and awards them together.
export function acceptBid(job, bid) {
  return supabase.rpc('accept_job_offer',{p_offer_id:bid.id})
}
