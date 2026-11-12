// Which side of the marketplace a notification belongs to. Amber = jobs (work
// someone wants done), blue = listings (what locals are offering). Shared by the
// Expo app and provider-web so the colour rule stays identical on both.

export type MarketSide = 'job' | 'listing'

type Metadata = { job_id?: unknown; booking_id?: unknown; service_id?: unknown } | null | undefined
type Notice = { metadata?: Metadata; type?: unknown } | null | undefined

// A job notification carries metadata.job_id; a listing one carries a
// booking_id or a service_id. Anything else (system notices, messages without a
// subject) has no side.
export function notificationSide(n: Notice): MarketSide | null {
  const m = (n && n.metadata) || {}
  if (m.job_id) return 'job'
  if (m.booking_id || m.service_id) return 'listing'
  return null
}

// Notification types where the recipient owns the subject (their posted job, or
// a listing/booking they host) → the tag reads "YOUR JOB" / "YOUR LISTING".
// Everything else keeps the neutral "JOB" / "LISTING" so we never claim
// ownership we aren't sure of.
// Upgrades to YOUR: new_bid, new_question, job_ready, job_completed,
// payment_details_sent (their job); new_booking, service_quote_accepted,
// booking_ready, booking_completed, work_completion_due,
// booking_cancellation_requested (a listing/booking they host).
// payment_marked_sent goes to the provider (not the job owner) → stays neutral.
// payment_sorted / payment_unsorted carry job_id (side = job) and can go to
// either party → stay neutral too.
const OWNER_TYPES = new Set([
  'new_bid', 'new_question', 'job_ready', 'job_completed', 'payment_details_sent', 'job_confirmed',
  'new_booking', 'service_quote_accepted', 'booking_ready',
  'booking_completed', 'work_completion_due', 'booking_cancellation_requested',
])

// Small-caps tag shown above a notification body. Null side → no tag.
export function sideTag(side: MarketSide | null, n?: Notice): string | null {
  if (!side) return null
  const noun = side === 'job' ? 'JOB' : 'LISTING'
  const type = n && typeof n.type === 'string' ? n.type : ''
  return OWNER_TYPES.has(type) ? `YOUR ${noun}` : noun
}
