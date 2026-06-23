import { supabase } from './supabase'
import { requestBadgeRefresh } from './badgeEvents'

export const NOTIFICATION_ICONS = {
  new_booking:                     'briefcase-outline',
  new_bid:                         'cash-outline',
  bid_accepted:                    'trophy-outline',
  bid_rejected:                    'close-circle-outline',
  job_cancelled:                   'alert-circle-outline',
  job_ready:                       'notifications-outline',
  job_completed:                   'checkmark-circle-outline',
  review_received:                 'star-outline',
  new_question:                    'help-circle-outline',
  question_answered:               'chatbubble-ellipses-outline',
  new_message:                     'chatbubble-ellipses-outline',
  service_quote_sent:              'document-text-outline',
  service_quote_accepted:          'trophy-outline',
  booking_confirmed:               'checkmark-circle-outline',
  booking_declined:                'close-circle-outline',
  booking_cancelled:               'alert-circle-outline',
  service_booking_withdrawn:       'alert-circle-outline',
  booking_ready:                   'notifications-outline',
  booking_completed:               'checkmark-circle-outline',
  booking_cancellation_requested:  'alert-circle-outline',
}

export async function fetchNotifications(limit = 50) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return []
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

// Marks the current user's unread notifications for a given job or booking as
// read — call when the user resolves the underlying item (e.g. confirms a
// booking) so stale "please confirm" prompts leave the Needs-attention feed.
export async function markNotificationsReadFor({ bookingId, jobId } = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    let q = supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false)
    if (bookingId) q = q.eq('metadata->>booking_id', bookingId)
    else if (jobId) q = q.eq('metadata->>job_id', jobId)
    else return
    await q
    requestBadgeRefresh()
  } catch {
    // Best-effort — the badge catches up on the next refresh
  }
}

export async function markAllNotificationsRead() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false)
  } catch {
    // Badge will catch up on the next refresh
  }
}

// Navigates to whatever a notification is about. Works from any stack that
// registers ServiceBookingDetail, ManageTask, and JobDetail.
export async function openNotificationTarget(navigation, userId, notification) {
  // Tapping a notification clears it from the Needs-attention feed.
  if (notification?.id && !notification.read) {
    supabase.from('notifications').update({ read: true }).eq('id', notification.id)
      .then(() => requestBadgeRefresh())
  }
  const meta = notification.metadata || {}
  try {
    // Chat-message notifications open the conversation directly.
    if (notification.type === 'new_message' && meta.sender_id) {
      const { data: sender } = await supabase
        .from('profiles').select('full_name').eq('id', meta.sender_id).maybeSingle()
      const otherUserName = sender?.full_name || 'Chat'
      if (meta.booking_id) {
        const { data: booking } = await supabase
          .from('bookings').select('service:service_id(title)').eq('id', meta.booking_id).maybeSingle()
        navigation.navigate('Chat', {
          bookingId:     meta.booking_id,
          jobTitle:      booking?.service?.title || 'Service booking',
          otherUserId:   meta.sender_id,
          otherUserName,
        })
        return
      }
      if (meta.job_id) {
        const { data: job } = await supabase
          .from('jobs').select('title').eq('id', meta.job_id).maybeSingle()
        navigation.navigate('Chat', {
          jobId:         meta.job_id,
          jobTitle:      job?.title || 'Job',
          otherUserId:   meta.sender_id,
          otherUserName,
        })
        return
      }
    }

    if (meta.booking_id) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('*, service:service_id(*), requester:requester_id(id, full_name, avatar_url), provider:provider_id(id, full_name, avatar_url)')
        .eq('id', meta.booking_id)
        .maybeSingle()
      if (!booking) return
      const viewerRole = booking.provider_id === userId ? 'provider' : 'requester'
      navigation.navigate('ServiceBookingDetail', { booking, viewerRole })
      return
    }
    if (meta.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', meta.job_id)
        .maybeSingle()
      if (!job) return
      // Q&A lives on JobDetail (incl. the owner's answer UI), so route question
      // notifications there rather than to the owner's ManageTask screen.
      const isQuestion = notification.type === 'new_question' || notification.type === 'question_answered'
      if (job.requester_id === userId && !isQuestion) navigation.navigate('ManageTask', { job, bidCount: 0 })
      else navigation.navigate('JobDetail', { job })
    }
  } catch {
    // Target may have been deleted — nothing to open
  }
}

export function notificationTimeAgo(isoString) {
  const then = new Date(isoString).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoString).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}
