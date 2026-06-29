// Sends each opted-in user a single "daily summary" push notification with a
// concise, role-aware roll-up of their jobs/services/bookings in flight.
// Invoked once a day by pg_cron (see daily-digest.sql), which passes header
// `x-cron-secret` matching the DIGEST_CRON_SECRET function secret.
//
// Opt-in lives in user_preferences.daily_digest (boolean). Users with nothing
// in flight, or with no registered devices, are skipped — no empty pings.
//
// Deploy:  supabase functions deploy daily-digest --no-verify-jwt
// Secret:  supabase secrets set DIGEST_CRON_SECRET=<random string>
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SB = ReturnType<typeof createClient>

const plural = (n: number) => (n === 1 ? '' : 's')

async function countRows(query: any): Promise<number> {
  const { count } = await query
  return count || 0
}

// Build the role-aware summary lines for one user, purely from their data
// (no role flag needed — a "both" user just gets lines from both sides).
async function summarize(supabase: SB, uid: string): Promise<string[]> {
  const lines: string[] = []

  // ── Requester: jobs they posted ──────────────────────────────────────────
  const { data: openJobRows } = await supabase
    .from('jobs').select('id').eq('requester_id', uid).eq('status', 'open')
  const openJobs = openJobRows?.length || 0
  if (openJobs > 0) {
    let offers = 0
    const ids = openJobRows!.map((r: { id: string }) => r.id)
    offers = await countRows(
      supabase.from('bids').select('id', { count: 'exact', head: true })
        .in('job_id', ids).eq('status', 'pending')
    )
    lines.push(`${openJobs} open job${plural(openJobs)}${offers > 0 ? ` · ${offers} offer${plural(offers)}` : ''}`)
  }

  const jobsToConfirm = await countRows(
    supabase.from('jobs').select('id', { count: 'exact', head: true })
      .eq('requester_id', uid).eq('status', 'awaiting_completion')
  )
  if (jobsToConfirm > 0) lines.push(`${jobsToConfirm} job${plural(jobsToConfirm)} to confirm complete`)

  const jobsAwarded = await countRows(
    supabase.from('jobs').select('id', { count: 'exact', head: true })
      .eq('requester_id', uid).in('status', ['accepted', 'in_progress'])
  )
  if (jobsAwarded > 0) lines.push(`${jobsAwarded} job${plural(jobsAwarded)} in progress`)

  // ── Requester: service bookings they made ────────────────────────────────
  const myBookings = await countRows(
    supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('requester_id', uid)
      .in('status', ['pending', 'quote_sent', 'confirmed', 'in_progress', 'awaiting_completion'])
  )
  if (myBookings > 0) lines.push(`${myBookings} of your booking${plural(myBookings)} in flight`)

  // ── Provider: bookings on their services ─────────────────────────────────
  const newRequests = await countRows(
    supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('provider_id', uid).eq('status', 'pending')
  )
  if (newRequests > 0) lines.push(`${newRequests} new booking request${plural(newRequests)}`)

  const provActive = await countRows(
    supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('provider_id', uid).in('status', ['quote_sent', 'confirmed', 'in_progress', 'awaiting_completion'])
  )
  if (provActive > 0) lines.push(`${provActive} service booking${plural(provActive)} on the go`)

  // ── Provider: jobs they won and are working ──────────────────────────────
  const { data: acceptedBids } = await supabase
    .from('bids').select('job_id').eq('provider_id', uid).eq('status', 'accepted')
  if (acceptedBids && acceptedBids.length > 0) {
    const jobIds = acceptedBids.map((b: { job_id: string }) => b.job_id)
    const jobsDoing = await countRows(
      supabase.from('jobs').select('id', { count: 'exact', head: true })
        .in('id', jobIds).in('status', ['accepted', 'in_progress', 'awaiting_completion'])
    )
    if (jobsDoing > 0) lines.push(`${jobsDoing} job${plural(jobsDoing)} you're doing`)
  }

  // Keep the push body readable — show the four most important lines.
  return lines.slice(0, 4)
}

async function sendExpo(messages: any[]): Promise<string[]> {
  const dead: string[] = []
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
            dead.push(chunk[idx].to)
          }
        })
      }
    } catch (e) {
      console.error('daily-digest: Expo request failed', e instanceof Error ? e.message : e)
    }
  }
  return dead
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = Deno.env.get('DIGEST_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Everyone who opted in.
  const { data: optedIn, error: prefErr } = await supabase
    .from('user_preferences').select('user_id').eq('daily_digest', true)
  if (prefErr) {
    console.error('daily-digest: could not load preferences', prefErr.message)
    return new Response('error', { status: 500 })
  }

  const messages: any[] = []
  let recipients = 0

  for (const row of optedIn ?? []) {
    const uid = (row as { user_id: string }).user_id
    try {
      const lines = await summarize(supabase, uid)
      if (lines.length === 0) continue            // nothing in flight — skip

      const { data: tokens } = await supabase
        .from('device_push_tokens').select('token').eq('user_id', uid)
      const tokenList = (tokens ?? []).map((t: { token: string }) => t.token).filter(Boolean)
      if (tokenList.length === 0) continue         // no devices — skip

      recipients++
      const body = lines.join(' · ')
      for (const to of tokenList) {
        messages.push({
          to,
          sound: 'default',
          title: 'Your daily summary',
          body,
          data: { type: 'daily_digest' },
        })
      }
    } catch (e) {
      console.error('daily-digest: summarize failed for', uid, e instanceof Error ? e.message : e)
    }
  }

  const dead = messages.length > 0 ? await sendExpo(messages) : []
  if (dead.length > 0) {
    await supabase.from('device_push_tokens').delete().in('token', dead)
  }

  return new Response(
    JSON.stringify({ optedIn: optedIn?.length ?? 0, recipients, pushes: messages.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
