import { supabase } from './supabase'

export const NOTIFICATION_ICONS = {
  new_booking:                     '📥',
  new_bid:                         '💰',
  bid_accepted:                    '🎉',
  bid_rejected:                    '📋',
  job_cancelled:                   '⚠️',
  job_completed:                   '✅',
  new_question:                    '❓',
  question_answered:               '💬',
  service_quote_sent:              '📄',
  service_quote_accepted:          '🎉',
  booking_confirmed:               '✅',
  booking_declined:                '📋',
  booking_cancelled:               '⚠️',
  service_booking_withdrawn:       '⚠️',
  booking_ready:                   '🔔',
  booking_completed:               '✅',
  booking_cancellation_requested:  '⚠️',
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
  const meta = notification.metadata || {}
  try {
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
      if (job.requester_id === userId) navigation.navigate('ManageTask', { job, bidCount: 0 })
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
