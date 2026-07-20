// Delivers due rows from email_outbox through Resend.
//
// Invoke every five minutes from Supabase Cron. The caller must send
// `x-email-secret` matching EMAIL_FUNCTION_SECRET. RESEND_API_KEY and the
// service-role credentials are read only from Edge Function secrets.
//
// Deploy: supabase functions deploy process-email-outbox --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Rural Connections <notifications@updates.ruralconnections.nz>'
const REPLY_TO = 'support@ruralconnections.nz'
const MAX_ATTEMPTS = 5
const BATCH_SIZE = 50

const SUBJECTS: Record<string, string> = {
  new_bid:                         'You have a new offer',
  new_booking:                     'You have a new booking request',
  new_job_invite:                  'You have a new job invitation',
  new_question:                    'A provider asked a question',
  question_answered:               'Your question has been answered',
  bid_accepted:                    'Your offer was accepted',
  job_cancelled:                   'Job cancelled',
  job_ready:                       'A job is ready to confirm',
  job_completed:                   'Job completed',
  service_quote_sent:              'You received a service quote',
  service_quote_accepted:          'Your quote was accepted',
  booking_confirmed:               'Booking confirmed',
  booking_declined:                'Booking update',
  booking_cancelled:               'Booking cancelled',
  service_booking_withdrawn:       'Booking request withdrawn',
  booking_ready:                   'Work is ready to confirm',
  booking_completed:               'Booking completed',
  booking_cancellation_requested:  'Cancellation requested',
  new_message:                     'You have an unread message',
}

type OutboxRow = {
  id: string
  user_id: string
  notification_id: string
  email_type: string
  attempts: number
  notification: {
    id: string
    read: boolean
    body: string | null
    type: string
    metadata: Record<string, unknown> | null
  } | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// Publicly reachable barn mark for the email header. Email clients can't read
// app bundle assets and Gmail strips base64 data URIs, so this must be a hosted
// URL — set the BRAND_LOGO_URL secret (e.g. a public Supabase Storage object).
// Falls back to the wordmark alone when unset.
const BRAND_LOGO_URL = Deno.env.get('BRAND_LOGO_URL') ?? ''

// Links must be https: Outlook (and Gmail) refuse to linkify custom schemes
// like difmrural://, so a raw deep link renders inert. We point at the public
// `open` function, which bounces the visitor into the app.
const OPEN_ENDPOINT = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/open`

function emailHtml(body: string, notificationId: string) {
  const safeBody = escapeHtml(body)
  const deepLink = `${OPEN_ENDPOINT}?n=${encodeURIComponent(notificationId)}`
  const logo = BRAND_LOGO_URL
    ? `<img src="${escapeHtml(BRAND_LOGO_URL)}" width="48" height="48" alt="Rural Connections"
           style="display:block;width:48px;height:48px;border:0;border-radius:12px;margin:0 0 14px" />`
    : ''
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f6f4;font-family:Arial,sans-serif;color:#1f2923">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#fff;border:1px solid #e1e5e2;border-radius:14px;padding:28px">
        ${logo}
        <div style="font-size:13px;font-weight:700;letter-spacing:1.4px;color:#2d6a4f;margin-bottom:22px">RURAL CONNECTIONS</div>
        <p style="font-size:17px;line-height:1.55;margin:0 0 22px">${safeBody}</p>
        <p style="font-size:14px;line-height:1.5;color:#66736b;margin:0">
          <a href="${deepLink}" style="color:#2d6a4f;font-weight:700;text-decoration:underline">Open Rural Connections</a>
          to view the details and respond.
        </p>
      </div>
      <p style="font-size:12px;line-height:1.5;color:#7a847e;text-align:center;margin:18px 0 0">You can manage email updates in Account settings.</p>
    </div>
  </body>
</html>`
}

function retryDelayMinutes(attempts: number) {
  return Math.min(5 * (2 ** attempts), 360)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const functionSecret = Deno.env.get('EMAIL_FUNCTION_SECRET')
  if (!functionSecret || req.headers.get('x-email-secret') !== functionSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return json({ error: 'Email service is not configured' }, 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // A worker may stop after claiming a row but before recording the result.
  // Release claims older than ten minutes; Resend's idempotency key prevents a
  // retry from creating a duplicate delivery if the first request succeeded.
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString()
  await supabase
    .from('email_outbox')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('status', 'processing')
    .lt('updated_at', staleBefore)

  const { data, error: loadError } = await supabase
    .from('email_outbox')
    .select('id, user_id, notification_id, email_type, attempts, notification:notification_id(id, read, body, type, metadata)')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(BATCH_SIZE)

  if (loadError) {
    console.error('process-email-outbox: load failed', loadError.message)
    return json({ error: 'Could not load email queue' }, 500)
  }

  const stats = { due: data?.length ?? 0, sent: 0, cancelled: 0, retried: 0, failed: 0 }

  for (const candidate of (data ?? []) as unknown as OutboxRow[]) {
    const { data: claimed } = await supabase
      .from('email_outbox')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', candidate.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claimed) continue // another worker claimed it

    const notification = candidate.notification
    if (!notification) {
      await supabase.from('email_outbox').update({ status: 'cancelled', last_error: 'Notification no longer exists' }).eq('id', candidate.id)
      stats.cancelled++
      continue
    }

    // A delayed chat email is no longer useful after the notification is read.
    if (candidate.email_type === 'new_message' && notification.read) {
      await supabase.from('email_outbox').update({ status: 'cancelled', last_error: null }).eq('id', candidate.id)
      stats.cancelled++
      continue
    }

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('email_transactional, email_messages')
      .eq('user_id', candidate.user_id)
      .maybeSingle()
    const allowed = candidate.email_type === 'new_message'
      ? prefs?.email_messages !== false
      : prefs?.email_transactional !== false
    if (!allowed) {
      await supabase.from('email_outbox').update({ status: 'cancelled', last_error: null }).eq('id', candidate.id)
      stats.cancelled++
      continue
    }

    const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(candidate.user_id)
    const recipient = userResult?.user?.email
    if (userError || !recipient) {
      await supabase.from('email_outbox').update({ status: 'failed', last_error: 'Recipient email is unavailable' }).eq('id', candidate.id)
      stats.failed++
      continue
    }

    const subject = SUBJECTS[candidate.email_type] ?? 'Rural Connections update'
    const body = notification.body?.trim() || 'There is an update waiting for you in Rural Connections.'
    const attempts = candidate.attempts + 1

    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `email-outbox-${candidate.id}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: [recipient],
          subject,
          text: `${body}\n\nOpen Rural Connections to view the details and respond:\n${OPEN_ENDPOINT}?n=${notification.id}`,
          html: emailHtml(body, notification.id),
          reply_to: REPLY_TO,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) throw new Error(result?.message || `Resend returned ${response.status}`)

      await supabase.from('email_outbox').update({
        status: 'sent', attempts, sent_at: new Date().toISOString(),
        provider_message_id: result?.id ?? null, last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', candidate.id)
      stats.sent++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const terminal = attempts >= MAX_ATTEMPTS
      await supabase.from('email_outbox').update({
        status: terminal ? 'failed' : 'pending',
        attempts,
        scheduled_for: new Date(Date.now() + retryDelayMinutes(attempts) * 60_000).toISOString(),
        last_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq('id', candidate.id)
      if (terminal) stats.failed++
      else stats.retried++
      console.error('process-email-outbox: delivery failed', candidate.id, message)
    }
  }

  return json(stats)
})
