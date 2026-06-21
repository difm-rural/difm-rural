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

// Canonical label for the verbose surfaces (detail screens, large cards).
// `open` reflects the bid count. Small cards may keep their own terse labels.
export function jobStatusLabel(status, bidCount = 0) {
  switch (status) {
    case JOB_STATUS.OPEN:
      return bidCount > 0 ? `${bidCount} bid${bidCount > 1 ? 's' : ''}` : 'Open'
    case JOB_STATUS.ACCEPTED:
    case JOB_STATUS.IN_PROGRESS:         return 'Awarded'
    case JOB_STATUS.AWAITING_COMPLETION: return 'Awaiting confirmation'
    case JOB_STATUS.COMPLETED:           return 'Completed'
    case JOB_STATUS.CANCELLED:           return 'Cancelled'
    default:                             return status
  }
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

// Canonical label for the verbose surfaces (booking detail screen).
export function bookingStatusLabel(status) {
  switch (status) {
    case BOOKING_STATUS.PENDING:                return 'Waiting for provider'
    case BOOKING_STATUS.QUOTE_SENT:             return 'Quote sent'
    case BOOKING_STATUS.CONFIRMED:              return 'Confirmed'
    case BOOKING_STATUS.IN_PROGRESS:            return 'In progress'
    case BOOKING_STATUS.AWAITING_COMPLETION:    return 'Ready for requester confirmation'
    case BOOKING_STATUS.CANCELLATION_REQUESTED: return 'Cancellation requested'
    case BOOKING_STATUS.COMPLETED:              return 'Completed'
    case BOOKING_STATUS.WITHDRAWN:              return 'Withdrawn'
    case BOOKING_STATUS.CANCELLED:              return 'Cancelled'
    case BOOKING_STATUS.DECLINED:               return 'Declined'
    default:                                    return status || 'Booking'
  }
}
