// Sends an Expo push notification when a row is inserted into `notifications`.
// Invoked by a Supabase Database Webhook (notifications → INSERT). The webhook
// must send header `x-webhook-secret` matching the PUSH_WEBHOOK_SECRET secret.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
// Secret:  supabase secrets set PUSH_WEBHOOK_SECRET=<random string>
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Short, human title per notification type; body comes from the row.
const TITLES: Record<string, string> = {
  new_booking:                    'New booking request',
  new_bid:                        'New bid',
  bid_accepted:                   'You got the job!',
  bid_rejected:                   'Bid update',
  job_cancelled:                  'Job cancelled',
  job_completed:                  'Job completed',
  new_question:                   'New question',
  question_answered:              'Question answered',
  new_message:                    'New message',
  service_quote_sent:             'Quote received',
  service_quote_accepted:         'Quote accepted',
  booking_confirmed:              'Booking confirmed',
  booking_declined:               'Booking declined',
  booking_cancelled:              'Booking cancelled',
  service_booking_withdrawn:      'Booking withdrawn',
  booking_ready:                  'Ready to confirm',
  booking_completed:              'Booking completed',
  booking_cancellation_requested: 'Cancellation requested',
  opportunity_match:              'Job opportunity nearby',
  opportunity_digest:             'Jobs matching your capabilities',
  saved_interest_match:           'New saved-search match',
  saved_interest_digest:          'Your saved-search update',
  availability_check:             'Are you available this week?',
  arrival_window_confirmed:       'Arrival window confirmed',
  running_late:                   'Running late',
  work_completion_due:            'Is the work complete?',
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET')
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: Record<string, any>
  try { payload = await req.json() } catch { return new Response('Bad payload', { status: 400 }) }

  const record = payload?.record
  if (!record?.user_id || !record?.body) return new Response('ok', { status: 200 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (record.type === 'opportunity_match' || record.type === 'opportunity_digest') {
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('opportunity_alert_mode, opportunity_push')
      .eq('user_id', record.user_id)
      .maybeSingle()

    const expectedMode = record.type === 'opportunity_match' ? 'instant' : 'daily'
    if (prefs?.opportunity_alert_mode !== expectedMode || prefs?.opportunity_push !== true) {
      return new Response('ok', { status: 200 })
    }
  }

  if (record.type === 'saved_interest_match' || record.type === 'saved_interest_digest') {
    const interestId = record.metadata?.saved_interest_id
    if (!interestId) return new Response('ok', { status: 200 })
    const { data: interest } = await supabase
      .from('saved_interests')
      .select('active, frequency, push_enabled')
      .eq('id', interestId)
      .eq('user_id', record.user_id)
      .maybeSingle()
    const expectedFrequency = record.type === 'saved_interest_match' ? 'instant' : 'daily'
    if (!interest?.active || interest.frequency !== expectedFrequency || interest.push_enabled !== true) {
      return new Response('ok', { status: 200 })
    }
  }

  if (record.type === 'availability_check') {
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('opportunity_alert_mode, opportunity_push')
      .eq('user_id', record.user_id)
      .maybeSingle()
    if (prefs?.opportunity_alert_mode === 'off' || prefs?.opportunity_push !== true) {
      return new Response('ok', { status: 200 })
    }
  }

  const { data: tokens } = await supabase
    .from('device_push_tokens')
    .select('token')
    .eq('user_id', record.user_id)

  const recipients = (tokens ?? []).map((t: { token: string }) => t.token).filter(Boolean)
  if (recipients.length === 0) return new Response('ok', { status: 200 })

  const title = TITLES[record.type] ?? 'Rural Connections'
  const messages = recipients.map((to: string) => ({
    to,
    sound: 'default',
    title,
    body: record.body,
    data: record.metadata ?? {},
  }))

  // Expo accepts up to 100 messages per request.
  const deadTokens: string[] = []
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      })
      const json = await res.json().catch(() => null)
      const data = json?.data
      if (Array.isArray(data)) {
        data.forEach((ticket: any, idx: number) => {
          if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
            deadTokens.push(chunk[idx].to)
          }
        })
      }
    } catch (e) {
      console.error('send-push: Expo request failed', e instanceof Error ? e.message : e)
    }
  }

  // Prune tokens Expo says are no longer valid (app uninstalled, etc.).
  if (deadTokens.length > 0) {
    await supabase.from('device_push_tokens').delete().in('token', deadTokens)
  }

  return new Response('ok', { status: 200 })
})
