// Service-booking mutations — one implementation each, with the right RLS/state
// guards baked in. Screens import these and keep their own UI (alerts, modals,
// navigation, local state). Each returns the Supabase result ({ data, error })
// unless noted, so callers handle UX their own way.

import { supabase } from './supabase'
import { saveReview } from './reviews'
import { BOOKING_STATUS, isBookingWithdrawable } from './lifecycle'

// Generic status transition with an allowed-from guard (no-op update if the
// row isn't in one of `allowedFrom`, which prevents racing past a state).
export function updateBookingStatus(bookingId, nextStatus, allowedFrom) {
  let q = supabase.from('bookings').update({ status: nextStatus }).eq('id', bookingId)
  if (allowedFrom?.length) q = q.in('status', allowedFrom)
  return q
}

// Provider accepts a (non-quote) booking request.
export function confirmBooking(bookingId) {
  return updateBookingStatus(bookingId, BOOKING_STATUS.CONFIRMED, [BOOKING_STATUS.PENDING])
}

// Provider flags the work done; requester then confirms.
export function markBookingReady(bookingId) {
  return updateBookingStatus(bookingId, BOOKING_STATUS.AWAITING_COMPLETION, [
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.IN_PROGRESS,
  ])
}

// Requester confirms the work is done -> closes the booking.
export function confirmBookingComplete(bookingId, requesterId) {
  return supabase
    .from('bookings')
    .update({ status: BOOKING_STATUS.COMPLETED })
    .eq('id', bookingId)
    .eq('requester_id', requesterId)
    .in('status', [BOOKING_STATUS.AWAITING_COMPLETION])
}

// Provider confirms a requester's cancellation request.
export function confirmBookingCancellation(bookingId, providerId) {
  return supabase
    .from('bookings')
    .update({ status: BOOKING_STATUS.CANCELLED })
    .eq('id', bookingId)
    .eq('provider_id', providerId)
    .eq('status', BOOKING_STATUS.CANCELLATION_REQUESTED)
}

// Provider sends/updates a quote.
export function sendBookingQuote(bookingId, providerId, { amount, notes } = {}) {
  return supabase
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
    .in('status', [BOOKING_STATUS.PENDING, BOOKING_STATUS.QUOTE_SENT, BOOKING_STATUS.CONFIRMED])
}

// Requester accepts a sent quote -> confirms the booking.
export function acceptBookingQuote(bookingId, requesterId) {
  return supabase
    .from('bookings')
    .update({ status: BOOKING_STATUS.CONFIRMED, quote_accepted_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('requester_id', requesterId)
    .eq('status', BOOKING_STATUS.QUOTE_SENT)
}

// Provider archives a closed (withdrawn/cancelled) booking from their list.
export function dismissProviderBooking(bookingId, providerId) {
  return supabase
    .from('bookings')
    .update({ provider_archive_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('provider_id', providerId)
    .in('status', [BOOKING_STATUS.WITHDRAWN, BOOKING_STATUS.CANCELLED])
}

// Requester ends a booking: withdraw outright before acceptance, otherwise
// request a cancellation the provider must confirm. Returns the Supabase result
// plus { isPending } so the caller can word its UI.
export async function cancelBookingByRequester(booking, requesterId, { reason, note } = {}) {
  const isPending = isBookingWithdrawable(booking.status)
  const patch = {
    status: isPending ? BOOKING_STATUS.WITHDRAWN : BOOKING_STATUS.CANCELLATION_REQUESTED,
  }
  if (reason !== undefined) patch.cancellation_reason = reason
  if (note !== undefined) patch.cancellation_note = note
  const res = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', booking.id)
    .eq('requester_id', requesterId)
    .eq('status', booking.status)
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
