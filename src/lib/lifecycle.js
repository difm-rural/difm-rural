// Single source of truth for job and service-booking lifecycles.
//
// Add a new status here once — the membership sets and label functions below
// flow out to every screen, so screens no longer hand-maintain their own
// `['open','accepted',...]` arrays and status `switch` statements.
//
// Two domains share this app (see CLAUDE.md):
//   • jobs + bids        — requester-led community board
//   • services + bookings — provider-led directory

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export const JOB_STATUS = {
  OPEN:                'open',
  ACCEPTED:            'accepted',
  IN_PROGRESS:         'in_progress',
  AWAITING_COMPLETION: 'awaiting_completion',
  COMPLETED:           'completed',
  CANCELLED:           'cancelled',
}

// In flight (show in "active" lists / dashboards).
export const JOB_ACTIVE_STATUSES = [
  JOB_STATUS.OPEN,
  JOB_STATUS.ACCEPTED,
  JOB_STATUS.IN_PROGRESS,
  JOB_STATUS.AWAITING_COMPLETION,
]
// Finished (show in "past" / history lists).
export const JOB_TERMINAL_STATUSES = [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED]
// A bid has been accepted — job is "awarded" and uses the awarded layout.
export const JOB_AWARDED_STATUSES = [
  JOB_STATUS.ACCEPTED,
  JOB_STATUS.IN_PROGRESS,
  JOB_STATUS.AWAITING_COMPLETION,
]

export const isJobActive   = s => JOB_ACTIVE_STATUSES.includes(s)
export const isJobTerminal = s => JOB_TERMINAL_STATUSES.includes(s)
export const isJobAwarded  = s => JOB_AWARDED_STATUSES.includes(s)

// Job convenience wrapper — delegates to the shared vocabulary below.
export function jobStatusLabel(status, bidCount = 0) {
  return statusLabel(status, bidCount)
}

// ─── Service bookings ───────────────────────────────────────────────────────────
export const BOOKING_STATUS = {
  PENDING:                'pending',
  QUOTE_SENT:             'quote_sent',
  CONFIRMED:              'confirmed',
  IN_PROGRESS:            'in_progress',
  AWAITING_COMPLETION:    'awaiting_completion',
  CANCELLATION_REQUESTED: 'cancellation_requested',
  COMPLETED:              'completed',
  WITHDRAWN:              'withdrawn',
  CANCELLED:              'cancelled',
  DECLINED:               'declined',
}

// In flight (show in "active" lists / dashboards).
export const BOOKING_ACTIVE_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.QUOTE_SENT,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.AWAITING_COMPLETION,
  BOOKING_STATUS.CANCELLATION_REQUESTED,
]
// Finished (show in "past" / history lists).
export const BOOKING_TERMINAL_STATUSES = [
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.WITHDRAWN,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.DECLINED,
]

export const isBookingActive   = s => BOOKING_ACTIVE_STATUSES.includes(s)
export const isBookingTerminal = s => BOOKING_TERMINAL_STATUSES.includes(s)

// Before a booking is accepted the requester can withdraw it outright; once
// it's confirmed/underway, ending it is a cancellation request the provider
// must confirm.
export const BOOKING_WITHDRAWABLE_STATUSES = [BOOKING_STATUS.PENDING, BOOKING_STATUS.QUOTE_SENT]
export const isBookingWithdrawable = s => BOOKING_WITHDRAWABLE_STATUSES.includes(s)

// Confirmed/underway — the provider can progress it or mark it ready.
export const BOOKING_UNDERWAY_STATUSES = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS]
export const isBookingUnderway = s => BOOKING_UNDERWAY_STATUSES.includes(s)

// Closed states the provider can archive/dismiss from their list.
export const BOOKING_DISMISSABLE_STATUSES = [BOOKING_STATUS.WITHDRAWN, BOOKING_STATUS.CANCELLED]
export const isBookingDismissable = s => BOOKING_DISMISSABLE_STATUSES.includes(s)

// Booking convenience wrapper — delegates to the shared vocabulary below.
export function bookingStatusLabel(status) {
  return statusLabel(status)
}

// ─── Unified status language ─────────────────────────────────────────────────
// One word per lifecycle stage, shared across jobs AND bookings so the same
// stage always reads the same wherever it appears — cards, badges, and detail
// screens. Status string values don't collide between the two domains, so a
// single map serves both. This is the only place lifecycle wording is defined.
//
//   open                 → "Open" / "{n} offers"   (job on the board)
//   pending              → "Requested"             (booking awaiting provider)
//   quote_sent           → "Quote sent"
//   accepted / confirmed → "Confirmed"             (provider engaged, going ahead)
//   in_progress          → "In progress"
//   awaiting_completion  → "Awaiting confirmation" (provider done, requester signs off)
//   cancellation_requested → "Cancellation requested"
//   completed            → "Completed"
//   withdrawn/declined/cancelled → as named
export function statusLabel(status, bidCount = 0) {
  switch (status) {
    case JOB_STATUS.OPEN:
      return bidCount > 0 ? `${bidCount} offer${bidCount > 1 ? 's' : ''}` : 'Open'
    case BOOKING_STATUS.PENDING:                return 'Requested'
    case BOOKING_STATUS.QUOTE_SENT:             return 'Quote sent'
    case JOB_STATUS.ACCEPTED:                   // jobs: a bid was accepted
    case BOOKING_STATUS.CONFIRMED:              // bookings: provider confirmed
      return 'Confirmed'
    case JOB_STATUS.IN_PROGRESS:                return 'In progress'
    case JOB_STATUS.AWAITING_COMPLETION:        return 'Awaiting confirmation'
    case BOOKING_STATUS.CANCELLATION_REQUESTED: return 'Cancellation requested'
    case JOB_STATUS.COMPLETED:                  return 'Completed'
    case BOOKING_STATUS.WITHDRAWN:              return 'Withdrawn'
    case JOB_STATUS.CANCELLED:                  return 'Cancelled'
    case BOOKING_STATUS.DECLINED:               return 'Declined'
    default:                                    return status || ''
  }
}

// Semantic tone for a status badge — lets every surface colour the same stage
// the same way. Screens map these keys to their own colour palette.
export function statusTone(status) {
  switch (status) {
    case JOB_STATUS.OPEN:                       return 'active'
    case BOOKING_STATUS.PENDING:
    case BOOKING_STATUS.QUOTE_SENT:             return 'waiting'
    case JOB_STATUS.ACCEPTED:
    case BOOKING_STATUS.CONFIRMED:
    case JOB_STATUS.IN_PROGRESS:                return 'engaged'
    case JOB_STATUS.AWAITING_COMPLETION:
    case BOOKING_STATUS.CANCELLATION_REQUESTED: return 'attention'
    case JOB_STATUS.COMPLETED:                  return 'done'
    case BOOKING_STATUS.WITHDRAWN:
    case BOOKING_STATUS.DECLINED:               return 'muted'
    case JOB_STATUS.CANCELLED:                  return 'cancelled'
    default:                                    return 'muted'
  }
}
