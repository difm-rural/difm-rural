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

// Provider flags the job done; requester then confirms.
// (The "accepted provider can mark awaiting_completion" RLS policy enforces who.)
export function markJobComplete(jobId) {
  return commit(
    supabase
      .from('jobs')
      .update({ status: JOB_STATUS.AWAITING_COMPLETION })
      .eq('id', jobId)
      .in('status', [JOB_STATUS.ACCEPTED, JOB_STATUS.IN_PROGRESS]),
    'This job is no longer in progress — please refresh.'
  )
}

// Requester confirms the work is done -> closes the job.
export function confirmJobComplete(jobId, requesterId) {
  return commit(
    supabase
      .from('jobs')
      .update({ status: JOB_STATUS.COMPLETED })
      .eq('id', jobId)
      .eq('requester_id', requesterId)
      .in('status', [JOB_STATUS.AWAITING_COMPLETION]),
    'This job can no longer be confirmed — please refresh.'
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
// (accepted / in_progress / awaiting_completion) — deleting then would orphan
// their work, so the owner must cancel (which notifies the provider) first.
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

// Requester accepts a bid: award the job, accept the chosen bid, reject the
// rest. The job is awarded first under an `open`-only guard, so a double-tap
// (or accepting after a cancel) is blocked before any bid is touched.
// Returns { error } — the first failing/raced step short-circuits.
export async function acceptBid(job, bid) {
  // 1) Award the job, but only if it's still open.
  const { data: awarded, error: awardError } = await supabase
    .from('jobs')
    .update({ status: JOB_STATUS.ACCEPTED })
    .eq('id', job.id)
    .eq('status', JOB_STATUS.OPEN)
    .select()
  if (awardError) return { error: awardError }
  if (!awarded || awarded.length === 0) {
    return { error: { code: 'stale', message: 'This job is no longer open for offers — please refresh.' } }
  }

  // 2) Accept the chosen offer, only if it's still pending.
  const { data: accepted, error: acceptError } = await supabase
    .from('bids')
    .update({ status: 'accepted' })
    .eq('id', bid.id)
    .eq('status', 'pending')
    .select()
  if (acceptError) return { error: acceptError }
  if (!accepted || accepted.length === 0) {
    // The chosen offer vanished after we awarded — revert so state stays sane.
    await supabase.from('jobs').update({ status: JOB_STATUS.OPEN })
      .eq('id', job.id).eq('status', JOB_STATUS.ACCEPTED)
    return { error: { code: 'stale', message: 'That offer is no longer available — please refresh and choose another.' } }
  }

  // 3) Reject the remaining pending offers.
  await supabase.from('bids').update({ status: 'rejected' })
    .eq('job_id', job.id).neq('id', bid.id).eq('status', 'pending')
  return { error: null }
}
