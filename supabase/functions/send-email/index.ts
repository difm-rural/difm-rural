// Sends a transactional email through Resend.
//
// This is an internal function: callers must present `x-email-secret` matching
// EMAIL_FUNCTION_SECRET. Deploy with --no-verify-jwt because database webhooks
// and scheduled jobs do not carry an end-user JWT; the shared secret is the
// authentication boundary instead.
//
// Required secrets:
//   RESEND_API_KEY
//   EMAIL_FUNCTION_SECRET

// Deploy:
//   supabase functions deploy send-email --no-verify-jwt

// Sender identity is deliberately fixed to the verified Resend subdomain so a
// compromised caller cannot spoof arbitrary From addresses.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Rural Connections <notifications@updates.ruralconnections.nz>'
const DEFAULT_REPLY_TO = 'support@ruralconnections.nz'

type EmailRequest = {
  to?: string | string[]
  subject?: string
  html?: string
  text?: string
  replyTo?: string
  idempotencyKey?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RECIPIENTS = 10
const MAX_SUBJECT_LENGTH = 200
const MAX_BODY_LENGTH = 200_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function validate(payload: EmailRequest): { recipients?: string[]; error?: string } {
  const recipients = (Array.isArray(payload.to) ? payload.to : [payload.to])
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim().toLowerCase())

  if (recipients.length === 0) return { error: 'At least one recipient is required.' }
  if (recipients.length > MAX_RECIPIENTS) return { error: `A maximum of ${MAX_RECIPIENTS} recipients is allowed.` }
  if (recipients.some(address => !EMAIL_RE.test(address))) return { error: 'One or more recipient addresses are invalid.' }
  if (!payload.subject?.trim()) return { error: 'A subject is required.' }
  if (payload.subject.length > MAX_SUBJECT_LENGTH) return { error: 'The subject is too long.' }
  if (!payload.html?.trim() && !payload.text?.trim()) return { error: 'An HTML or text body is required.' }
  if ((payload.html?.length ?? 0) > MAX_BODY_LENGTH || (payload.text?.length ?? 0) > MAX_BODY_LENGTH) {
    return { error: 'The email body is too large.' }
  }
  if (payload.replyTo && !EMAIL_RE.test(payload.replyTo.trim())) return { error: 'The reply-to address is invalid.' }

  return { recipients }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const functionSecret = Deno.env.get('EMAIL_FUNCTION_SECRET')
  if (!functionSecret || req.headers.get('x-email-secret') !== functionSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.error('send-email: RESEND_API_KEY is not configured')
    return json({ error: 'Email service is not configured' }, 500)
  }

  let payload: EmailRequest
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400)
  }

  const { recipients, error } = validate(payload)
  if (error || !recipients) return json({ error }, 400)

  const resendPayload: Record<string, unknown> = {
    from: FROM,
    to: recipients,
    subject: payload.subject!.trim(),
    reply_to: payload.replyTo?.trim() || DEFAULT_REPLY_TO,
  }
  if (payload.html?.trim()) resendPayload.html = payload.html
  if (payload.text?.trim()) resendPayload.text = payload.text

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (payload.idempotencyKey?.trim()) {
    headers['Idempotency-Key'] = payload.idempotencyKey.trim().slice(0, 256)
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(resendPayload),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      console.error('send-email: Resend rejected request', response.status, result?.message ?? result)
      return json({ error: 'Email delivery was rejected' }, 502)
    }

    return json({ id: result?.id, recipients: recipients.length }, 200)
  } catch (error) {
    console.error('send-email: Resend request failed', error instanceof Error ? error.message : error)
    return json({ error: 'Email delivery failed' }, 502)
  }
})
