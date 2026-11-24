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

// Event labels are shared by mobile, web and Home; marketplace colour stays
// based on the existing job/listing side rather than implying ownership.
const EVENT_LABELS:Record<string,string>={
 review_received:'REVIEW',job_completed:'COMPLETED',booking_completed:'COMPLETED',
 new_message:'MESSAGE',job_confirmed:'CONFIRMED',arrival_window_confirmed:'CONFIRMED',
 new_bid:'OFFER',new_question:'QUESTION',question_answered:'ANSWER',bid_accepted:'ACCEPTED',
 new_booking:'BOOKING',booking_confirmed:'BOOKING',booking_declined:'BOOKING',booking_cancelled:'BOOKING',
 service_booking_withdrawn:'BOOKING',booking_ready:'BOOKING',booking_cancellation_requested:'BOOKING',
 service_quote_sent:'QUOTE',service_quote_accepted:'ACCEPTED',bid_rejected:'OFFER',
 new_job_invite:'INVITATION',job_cancelled:'CANCELLED',job_ready:'READY',running_late:'ARRIVAL UPDATE',
 work_completion_due:'COMPLETION',opportunity_match:'OPPORTUNITY',opportunity_digest:'OPPORTUNITIES',
 saved_interest_match:'SAVED SEARCH',saved_interest_digest:'SAVED SEARCH',availability_check:'AVAILABILITY',
 payment_details_sent:'PAYMENT',payment_marked_sent:'PAYMENT',payment_sorted:'PAYMENT',payment_unsorted:'PAYMENT',
}
export function sideTag(_side:MarketSide|null,n?:Notice):string|null {
 const type=n&&typeof n.type==='string'?n.type:''
 return type?(EVENT_LABELS[type]||'UPDATE'):null
}
