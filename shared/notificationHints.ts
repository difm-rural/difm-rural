// Suggestions describe where to respond, never whether a historical action is
// still outstanding. Read state is deliberately not part of this mapping.
export function notificationHint(type?:string):string|null {
 return ({new_message:'Reply in chat',new_question:'Answer question',question_answered:'View answer',
  new_bid:'Review offer',bid_accepted:'View arrangements',new_booking:'Review booking request',
  service_quote_sent:'Review quote',job_completed:'View review options',booking_completed:'View review options',
  booking_cancellation_requested:'Review cancellation request'} as Record<string,string>)[type||'']||null
}
