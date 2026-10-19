export const ACTIVE_JOBS = ['open', 'accepted', 'in_progress', 'awaiting_completion']
export const ACTIVE_BOOKINGS = ['pending', 'quote_sent', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested']
export function statusLabel(status: string) {
  return ({ pending: 'Booking request', quote_sent: 'Quote to review', confirmed: 'Confirmed', in_progress: 'In progress',
    cancellation_requested: 'Cancellation requested', completed: 'Completed', open: 'Open', accepted: 'Accepted',
    cancelled: 'Cancelled', withdrawn: 'Withdrawn', declined: 'Declined' } as Record<string,string>)[status] || status.replaceAll('_', ' ')
}
export function messagePreview(content: string | null) {
  if (!content) return 'New message'
  try { const value = JSON.parse(content); if (value.type === 'photo') return value.caption || 'Photo'; if (value.type === 'location') return 'Shared location' } catch {}
  return content
}
export function notificationHref(notification: {type:string;metadata?:Record<string,unknown> | null}) {
  const m=notification.metadata || {}
  if(notification.type==='availability_check' || m.availability_prompt)return '/account/availability'
  if(notification.type==='new_message' && m.sender_id){
    const kind=m.booking_id?'booking':m.job_id?'job':m.service_id?'listing':null
    const id=m.booking_id || m.job_id || m.service_id
    if(kind && id)return '/messages?kind='+kind+'&id='+encodeURIComponent(String(id))+'&person='+encodeURIComponent(String(m.sender_id))
  }
  if(notification.type==='new_message' && m.booking_id)return '/activity/booking/'+encodeURIComponent(String(m.booking_id))
  if(notification.type==='new_message' && m.job_id)return '/activity/job/'+encodeURIComponent(String(m.job_id))
  if(notification.type==='new_message' && m.service_id && m.sender_id)return '/enquiries?s='+encodeURIComponent(String(m.service_id))+'&c='+encodeURIComponent(String(m.sender_id))
  if(m.booking_id)return '/activity/booking/'+encodeURIComponent(String(m.booking_id))+'/manage'
  if(m.job_id)return '/jobs/'+encodeURIComponent(String(m.job_id))
  if(m.service_id)return '/browse/'+encodeURIComponent(String(m.service_id))
  return '/activity'
}
