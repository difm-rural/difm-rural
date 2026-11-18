// Live OAuth checks for the AI connector. NOT part of `npm test`.
// Run right after the Supabase OAuth server is turned on:
//
//   node --import ./tests/support/ts-resolve.mjs tests/ai-connector-oauth-live.mjs
//
// It gets a REAL assistant token for test.other@difmrural.test the way an MCP
// client would (dynamic client registration → /oauth/authorize with PKCE →
// consent → /oauth/token), doing the consent step with supabase-js exactly as
// provider-web's /oauth/consent does, then checks that the token:
//   A. cannot change the member's email, password or metadata via the Auth API;
//   B. cannot write through PostgREST, RPCs, Storage or the guarded edge functions;
//   C. can still read (jobs_public) and pass the rc-mcp gate;
//   D. stops working once the member disconnects the assistant (revokeGrant).
// Cleanup: reverts anything A changed, revokes the grant, deletes the test client.
// Exit code 2 = an Auth API write was accepted: turn the OAuth server OFF.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const URL_ = 'https://opagkgfxmjqmnvhrcris.supabase.co'
const KEY = 'sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'
const EMAIL = 'test.other@difmrural.test'
const PASSWORD = 'TestPass123!'
const REDIRECT = 'http://127.0.0.1:53682/callback'
const results = []
let authApiBreach = false

// SQL goes through a temp file: passing it as an argument through the Windows
// shell splits it on spaces and semicolons.
function sql(query) {
  const file = join(tmpdir(), `rc-ai-live-${process.pid}-${Date.now()}.sql`)
  writeFileSync(file, query)
  try {
    const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', JSON.stringify(file), '-o', 'json'], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const start = out.indexOf('{')
    return start < 0 ? [] : (JSON.parse(out.slice(start)).rows || [])
  } finally { rmSync(file, { force: true }) }
}
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('  ✔', name) }
  catch (err) { results.push(['FAIL', name, err.message]); console.log('  ✖', name, '\n     ', err.message) }
}
const b64url = buf => buf.toString('base64url')
const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'))

// Member session (the consent screen runs as the signed-in member).
const member = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: signedIn, error: signInError } = await member.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (signInError) throw signInError
const userId = signedIn.user.id
const originalEmail = signedIn.user.email
let clientId = null
let token = null

try {
  // 1. Dynamic client registration (what Claude's connector does).
  const reg = await fetch(`${URL_}/auth/v1/oauth/clients/register`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'RC live test client', redirect_uris: [REDIRECT], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none' }),
  })
  const client = await reg.json()
  if (!reg.ok) throw new Error(`Client registration failed (${reg.status}): ${JSON.stringify(client)}`)
  clientId = client.client_id
  console.log('Registered test client', clientId)

  // 2. Authorization request with PKCE → Supabase redirects to <Site URL>/oauth/consent.
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const authorize = new URL(`${URL_}/auth/v1/oauth/authorize`)
  Object.entries({ client_id: clientId, redirect_uri: REDIRECT, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'live-test' })
    .forEach(([k, v]) => authorize.searchParams.set(k, v))
  const authResponse = await fetch(authorize, { redirect: 'manual', headers: { apikey: KEY } })
  const consentUrl = new URL(authResponse.headers.get('location') || 'about:blank')
  console.log('Consent URL host/path:', consentUrl.origin + consentUrl.pathname)
  await check('authorize redirects to the console consent screen', async () => {
    assert.equal(consentUrl.origin + consentUrl.pathname, 'https://dev.ruralconnections.nz/oauth/consent')
  })
  const authorizationId = consentUrl.searchParams.get('authorization_id')
  if (!authorizationId) throw new Error('No authorization_id in ' + consentUrl)

  // 3. Consent, as provider-web's page does it.
  const details = await member.auth.oauth.getAuthorizationDetails(authorizationId)
  if (details.error) throw details.error
  await check('consent details name the registered app', async () => assert.equal(details.data.client?.name, 'RC live test client'))
  const approved = await member.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
  if (approved.error) throw approved.error
  const code = new URL(approved.data.redirect_url).searchParams.get('code')

  // 4. Token exchange.
  const tokenResponse = await fetch(`${URL_}/auth/v1/oauth/token`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }),
  })
  const tokens = await tokenResponse.json()
  if (!tokenResponse.ok) throw new Error('Token exchange failed: ' + JSON.stringify(tokens))
  token = tokens.access_token
  await check('the access token carries client_id and a session_id', async () => {
    const c = claims(token)
    assert.equal(c.client_id, clientId)
    assert.equal(c.sub, userId)
    assert.ok(c.session_id)
  })

  const assistant = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } })
  const authApi = (body) => fetch(`${URL_}/auth/v1/user`, { method: 'PUT', headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  console.log('\nA. Auth API (must refuse)')
  for (const [label, body] of [
    ['change email', { email: 'test.other+assistant@difmrural.test' }],
    ['change password', { password: 'Assistant-Changed-1!' }],
    ['change user metadata', { data: { full_name: 'Changed by assistant' } }],
  ]) {
    await check(`assistant token cannot ${label}`, async () => {
      const r = await authApi(body)
      const text = await r.text()
      if (r.ok) authApiBreach = true
      assert.ok(!r.ok, `Auth API accepted it (${r.status}): ${text.slice(0, 160)}`)
      console.log(`     → ${r.status} ${text.slice(0, 120)}`)
    })
  }

  console.log('\nB. Writes (must refuse)')
  await check('PostgREST insert is refused', async () => {
    const { error } = await assistant.from('watchlist').insert({ user_id: userId, job_id: '00000000-0000-4000-8000-000000000009' })
    assert.ok(error, 'insert succeeded')
  })
  await check('PostgREST update changes nothing', async () => {
    const { data, error } = await assistant.from('profiles').update({ bio: 'assistant was here' }).eq('id', userId).select('id')
    assert.ok(error || data.length === 0, 'profile updated')
  })
  await check('write RPC is refused', async () => {
    const { error } = await assistant.rpc('accept_job_offer', { p_offer_id: '00000000-0000-4000-8000-000000000009' })
    assert.match(error?.message || '', /read-only access/)
  })
  await check('Storage upload is refused', async () => {
    const { error } = await assistant.storage.from('avatars').upload(`${userId}/assistant-test.txt`, new Blob(['x']), { upsert: true })
    assert.ok(error, 'upload succeeded')
  })
  for (const fn of ['categorize-job', 'draft-job-from-text', 'draft-job-from-photo', 'create-service-draft-from-photo', 'maps-proxy', 'marketplace-health']) {
    await check(`edge function ${fn} returns 403 read-only`, async () => {
      const r = await fetch(`${URL_}/functions/v1/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' })
      const body = await r.json().catch(() => ({}))
      assert.equal(r.status, 403)
      assert.equal(body.message, 'AI assistants have read-only access')
    })
  }

  console.log('\nC. Reads still work')
  await check('jobs_public is readable', async () => {
    const { error } = await assistant.from('jobs_public').select('id').limit(1)
    assert.equal(error, null)
  })
  const wasEnabled = sql('select ai_enabled from public.ai_settings where id')[0]?.ai_enabled === true
  sql('update public.ai_settings set ai_enabled = true where id')
  try {
    await check('the rc-mcp gate admits the assistant (and audits client_id)', async () => {
      const { data, error } = await assistant.rpc('ai_begin_tool_call', { p_tool: 'search_jobs' })
      assert.equal(error, null)
      assert.equal(data.allowed, true)
      const row = sql(`select client_id from public.ai_tool_calls where id = ${Number(data.call_id)}`)[0]
      assert.equal(row.client_id, clientId)
    })

    console.log('\nD. Disconnect')
    const listed = await member.auth.oauth.listGrants()
    await check('Connected assistants lists the test client', async () => assert.ok((listed.data || []).some(g => g.client?.id === clientId)))
    const revoked = await member.auth.oauth.revokeGrant({ clientId })
    await check('Disconnect succeeds', async () => assert.equal(revoked.error, null))
    await check('the disconnected token is refused by the gate', async () => {
      const { data } = await assistant.rpc('ai_begin_tool_call', { p_tool: 'search_jobs' })
      assert.equal(data?.allowed, false)
      assert.equal(data?.reason, 'denied_session')
    })
    await check('the refresh token no longer works', async () => {
      const r = await fetch(`${URL_}/auth/v1/oauth/token`, {
        method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }),
      })
      assert.ok(!r.ok, 'refresh still works')
    })
  } finally {
    sql(`update public.ai_settings set ai_enabled = ${wasEnabled} where id; delete from public.ai_tool_calls where user_id = '${userId}'`)
    console.log(`ai_enabled restored to ${wasEnabled}`)
  }
} finally {
  // Revert anything the Auth API wrongly accepted, using the member's own session.
  const { data: now } = await member.auth.getUser()
  if (now?.user && now.user.email !== originalEmail) console.log('⚠ email changed to', now.user.email)
  if (authApiBreach) {
    await member.auth.updateUser({ password: PASSWORD, data: { full_name: 'Test Other' } }).catch(() => {})
    sql(`update auth.users set email_change = '', email_change_token_new = '', email_change_token_current = '', email = '${originalEmail}' where id = '${userId}'`)
    console.log('Reverted Auth API changes for', EMAIL)
  }
  if (clientId) {
    await member.auth.oauth.revokeGrant({ clientId }).catch(() => {})
    sql(`delete from auth.oauth_consents where client_id = '${clientId}'; delete from auth.oauth_authorizations where client_id = '${clientId}'; delete from auth.sessions where oauth_client_id = '${clientId}'; delete from auth.oauth_clients where id = '${clientId}'`)
    console.log('Deleted test client', clientId)
  }
  await member.auth.signOut({ scope: 'local' }).catch(() => {})
}

const failed = results.filter(r => r[0] === 'FAIL')
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (authApiBreach) { console.log('AUTH API ACCEPTED AN ASSISTANT WRITE: turn the OAuth server OFF.'); process.exit(2) }
process.exit(failed.length ? 1 : 0)
