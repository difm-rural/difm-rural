import { createClient } from 'npm:@supabase/supabase-js@2'

// Leave time to return a response before the scheduler's 30-second HTTP limit.
const REQUEST_BUDGET_MS = 24_000

async function matchesSecret(supplied: string, expected: string) {
  const bytes = new TextEncoder()
  const [actual, wanted] = await Promise.all([supplied, expected].map(async value =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.encode(value))),
  ))
  let difference = 0
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ wanted[i]
  return difference === 0
}

Deno.serve(async request => {
  const respond = (status: string, code = 200) =>
    Response.json({ status }, { status: code, headers: { 'Cache-Control': 'no-store' } })

  if (request.method !== 'POST') return respond('method_not_allowed', 405)

  const url = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !publicKey || !serviceKey) return respond('unavailable', 503)
  const auth = { persistSession: false, autoRefreshToken: false }
  const deadline = AbortSignal.timeout(REQUEST_BUDGET_MS)
  const boundedFetch: typeof fetch = (input, init) => fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
  })
  let stage = 'authorisation'
  const unavailable = (status: string) => {
    console.error(JSON.stringify({ event: 'marketplace_health_error', stage, status, timed_out: deadline.aborted }))
    return respond(status, 503)
  }

  try {
    const supplied = request.headers.get('x-marketplace-health-secret')
    let source = 'manual'
    if (supplied !== null) {
      const expected = Deno.env.get('MARKETPLACE_HEALTH_CRON_SECRET')
      if (!expected || !await matchesSecret(supplied, expected)) return respond('unauthorised', 401)
      source = 'scheduled'
    } else {
      const authorization = request.headers.get('Authorization')
      if (!authorization?.startsWith('Bearer ')) return respond('unauthorised', 401)
      const caller = createClient(url, publicKey, {
        auth, global: { fetch: boundedFetch, headers: { Authorization: authorization } },
      })
      const { data: { user }, error: authError } = await caller.auth.getUser(authorization.slice(7))
      if (deadline.aborted) return unavailable('unavailable')
      if (authError || !user) return respond('unauthorised', 401)
      const { data: admin, error } = await caller.rpc('current_user_is_admin')
      if (error) return unavailable('unavailable')
      if (admin !== true) return respond('forbidden', 403)
    }

    stage = 'claim'
    const worker = createClient(url, serviceKey, { auth, global: { fetch: boundedFetch } })
    const { data: claim, error: claimError } = await worker.rpc('marketplace_health_claim', { p_source: source })
    if (claimError || !claim) return unavailable('unavailable')
    if (claim.status !== 'claimed') return respond(claim.status)

    stage = 'finish'
    const { data: result, error } = await worker.rpc('marketplace_health_finish', {
      p_day: claim.run_date,
      p_source: source,
      p_claim: claim.claim_id,
    })
    if (error || !result) return unavailable('interrupted')
    if (result === 'failed' || result === 'claim_lost') return unavailable(result)
    return respond(result)
  } catch {
    return unavailable(stage === 'finish' ? 'interrupted' : 'unavailable')
  }
})
