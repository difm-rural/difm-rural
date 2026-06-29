// Service-booking mutations — one implementation each, with the right RLS/state
// guards baked in. Screens import these and keep their own UI (alerts, modals,
// navigation, local state). Each returns { data, error }.
//
// Like the job actions, every transition is guarded with an allowed-from list
// AND checked for "no rows changed", so a raced update (double-tap, or the
// other party acting first) returns a friendly `stale` error instead of a false
// success.

import { supabase } from './supabase'
import { saveReview } from './reviews'
import { BOOKING_STATUS, isBookingWithdrawable } from './lifecycle'

// Awaits a guarded mutation and turns a zero-row result into a stale error.
async function commit(query, staleMessage) {
  const { data, error } = await query.select()
  if (error) return { data: null, error }
  if (!data || data.length === 0) {
    return { data: null, error: { code: 'stale', message: staleMessage || 'This booking has already changed — please refresh.' } }
  }
  return { data, error: null }
}

// Generic status transition with an allowed-from guard. Racing past a state
// matches no rows and surfaces as a stale error rather than a silent no-op.
export function updateBookingStatus(bookingId, nextStatus, allowedFrom, staleMessage) {
  let q = supabase.from('bookings').update({ status: nextStatus }).eq('id', bookingId)
  if (allowedFrom?.length) q = q.in('status', allowedFrom)
  return commit(q, staleMessage)
}

// Provider accepts a (non-quote) booking request.
export function confirmBooking(bookingId) {
  return updateBookingStatus(bookingId, BOOKING_STATUS.CONFIRMED, [BOOKING_STATUS.PENDING],
    'This request can no longer be confirmed — please refresh.')
}

// Provider declines a request before any work is done.
export function declineBooking(bookingId) {
  return updateBookingStatus(bookingId, BOOKING_STATUS.CANCELLED,
    [BOOKING_STATUS.PENDING, BOOKING_STATUS.QUOTE_SENT],
    'This request can no longer be declined — please refresh.')
}

// Provider flags the work done; requester then confirms.
export function markBookingReady(bookingId) {
  return updateBookingStatus(bookingId, BOOKING_STATUS.AWAITING_COMPLETION,
    [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS],
    'This booking is no longer in progress — please refresh.')
}

// Requester confirms the work is done -> closes the booking.
export function confirmBookingComplete(bookingId, requesterId) {
  return commit(
    supabase
      .from('bookings')
      .update({ status: BOOKING_STATUS.COMPLETED })
      .eq('id', bookingId)
      .eq('requester_id', requesterId)
      .in('status', [BOOKING_STATUS.AWAITING_COMPLETION]),
    'This booking can no longer be confirmed — please refresh.'
  )
}

// Provider confirms a requester's cancellation request.
export function confirmBookingCancellation(bookingId, providerId) {
  return commit(
    supabase
      .from('bookings')
      .update({ status: BOOKING_STATUS.CANCELLED })
      .eq('id', bookingId)
      .eq('provider_id', providerId)
      .eq('status', BOOKING_STATUS.CANCELLATION_REQUESTED),
    'This cancellation has already been handled — please refresh.'
  )
}

// Provider sends/updates a quote.
export function sendBookingQuote(bookingId, providerId, { amount, notes } = {}) {
  return commit(
    supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.QUOTE_SENT,
        quote_amount: amount,
        quote_notes: notes || null,
        total_amount: amount,
        quote_sent_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('provider_id', providerId)
      .in('status', [BOOKING_STATUS.PENDING, BOOKING_STATUS.QUOTE_SENT, BOOKING_STATUS.CONFIRMED]),
    'This booking can no longer be quoted — please refresh.'
  )
}

// Requester accepts a sent quote -> confirms the booking.
export function acceptBookingQuote(bookingId, requesterId) {
  return commit(
    supabase
      .from('bookings')
      .update({ status: BOOKING_STATUS.CONFIRMED, quote_accepted_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('requester_id', requesterId)
      .eq('status', BOOKING_STATUS.QUOTE_SENT),
    'This quote can no longer be accepted — please refresh.'
  )
}

// Provider archives a closed (withdrawn/cancelled) booking from their list.
export function dismissProviderBooking(bookingId, providerId) {
  return commit(
    supabase
      .from('bookings')
      .update({ provider_archive_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('provider_id', providerId)
      .in('status', [BOOKING_STATUS.WITHDRAWN, BOOKING_STATUS.CANCELLED]),
    'This booking can no longer be dismissed — please refresh.'
  )
}

// Requester ends a booking: withdraw outright before acceptance, otherwise
// request a cancellation the provider must confirm. The `.eq('status', …)`
// guard is optimistic-concurrency on the exact status the caller saw. Returns
// the result plus { isPending } so the caller can word its UI.
export async function cancelBookingByRequester(booking, requesterId, { reason, note } = {}) {
  const isPending = isBookingWithdrawable(booking.status)
  const patch = {
    status: isPending ? BOOKING_STATUS.WITHDRAWN : BOOKING_STATUS.CANCELLATION_REQUESTED,
  }
  if (reason !== undefined) patch.cancellation_reason = reason
  if (note !== undefined) patch.cancellation_note = note
  const res = await commit(
    supabase
      .from('bookings')
      .update(patch)
      .eq('id', booking.id)
      .eq('requester_id', requesterId)
      .eq('status', booking.status),
    'This booking has already changed — please refresh.'
  )
  return { ...res, isPending }
}

// Save the viewer's review of the other party on a booking.
export function saveBookingReview({ booking, viewerRole, reviewerId, rating, comment }) {
  const revieweeId = viewerRole === 'provider' ? booking.requester_id : booking.provider_id
  const revieweeRole = viewerRole === 'provider' ? 'requester' : 'provider'
  return saveReview({
    bookingId: booking.id,
    reviewerId,
    revieweeId,
    reviewerRole: viewerRole,
    revieweeRole,
    rating,
    comment,
  })
}
