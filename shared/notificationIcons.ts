// Notification type → semantic icon key. Shared by the Expo app and
// provider-web so both pick the same picture for the same notice; each
// platform maps the key onto its own icon set (Ionicons in the app via
// src/lib/notifications.js, lucide in provider-web).

export type NotificationIconKey =
  | 'briefcase' | 'cash' | 'invite' | 'trophy' | 'declined' | 'alert' | 'bell'
  | 'done' | 'done-all' | 'star' | 'question' | 'chat' | 'document'
  | 'bookmark' | 'calendar' | 'car' | 'card'

export const NOTIFICATION_ICON_KEYS: Record<string, NotificationIconKey> = {
  new_booking:                     'briefcase',
  new_bid:                         'cash',
  new_job_invite:                  'invite',
  bid_accepted:                    'trophy',
  bid_rejected:                    'declined',
  job_cancelled:                   'alert',
  job_ready:                       'bell',
  job_completed:                   'done',
  review_received:                 'star',
  new_question:                    'question',
  question_answered:               'chat',
  new_message:                     'chat',
  service_quote_sent:              'document',
  service_quote_accepted:          'trophy',
  booking_confirmed:               'done',
  booking_declined:                'declined',
  booking_cancelled:               'alert',
  service_booking_withdrawn:       'alert',
  booking_ready:                   'bell',
  opportunity_match:               'briefcase',
  opportunity_digest:              'briefcase',
  saved_interest_match:            'bookmark',
  saved_interest_digest:           'bookmark',
  availability_check:              'calendar',
  arrival_window_confirmed:        'calendar',
  running_late:                    'car',
  work_completion_due:             'done-all',
  booking_completed:               'done',
  booking_cancellation_requested:  'alert',
  payment_details_sent:            'card',
  payment_marked_sent:             'done-all',
  payment_sorted:                  'done-all',
  payment_unsorted:                'card',
  job_confirmed:                   'done',
}

export function notificationIconKey(type: unknown): NotificationIconKey {
  return (typeof type === 'string' && NOTIFICATION_ICON_KEYS[type]) || 'bell'
}
