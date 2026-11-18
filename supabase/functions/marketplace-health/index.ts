import { createClient } from 'npm:@supabase/supabase-js@2'
import { refuseAssistantToken } from '../_shared/assistant-token.ts'

const REQUEST_BUDGET_MS = 24_000

Deno.serve(async request => {
  const respond = (status: string, code = 200) =>
    Response.json({ status }, { status: code, headers: { 'Cache-Control': 'no-store' } })

  if (request.method !== 'POST') return respond('method_not_allowed', 405)
  const assistant = refuseAssistantToken(request, { 'Cache-Control': 'no-store' })
  if (assistant) return assistant
  if (request.headers.has('x-marketplace-health-secret')) return respond('scheduling_disabled', 403)
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return respond('unauthorised', 401)

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
    const caller = createClient(url, publicKey, {
      auth, global: { fetch: boundedFetch, headers: { Authorization: authorization } },
    })
    const { data: { user }, error: authError } = await caller.auth.getUser(authorization.slice(7))
    if (deadline.aborted) return unavailable('unavailable')
    if (authError || !user) return respond('unauthorised', 401)
    const { data: admin, error: adminError } = await caller.rpc('current_user_is_admin')
    if (adminError) return unavailable('unavailable')
    if (admin !== true) return respond('forbidden', 403)

    stage = 'claim'
    const worker = createClient(url, serviceKey, { auth, global: { fetch: boundedFetch } })
    const { data: claim, error: claimError } = await worker.rpc('marketplace_health_claim', { p_source: 'manual' })
    if (claimError || !claim) return unavailable('unavailable')
    if (claim.status !== 'claimed') return respond(claim.status)

    stage = 'finish'
    const { data: result, error } = await worker.rpc('marketplace_health_finish', {
      p_day: claim.run_date,
      p_source: 'manual',
      p_claim: claim.claim_id,
    })
    if (error || !result) return unavailable('interrupted')
    if (result === 'failed' || result === 'claim_lost') return unavailable(result)
    return respond(result)
  } catch {
    return unavailable(stage === 'finish' ? 'interrupted' : 'unavailable')
  }
})
