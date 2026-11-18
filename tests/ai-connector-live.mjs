// Live checks for the AI connector against the linked Supabase project.
// NOT part of `npm test`. Needs the 20261118190000_ai_connector migration.
//
//   node --import ./tests/support/ts-resolve.mjs tests/ai-connector-live.mjs
//
// Members: test.requester, test.provider and test.other @difmrural.test (all
// created by normal sign-up, password as in tests/e2e-job-flow.js).
//
// What it checks, as three signed-in members (requester R, provider P, other O):
//   1. RLS + tool rules: each tool's output only contains what that member may
//      see; nobody gets an exact address; at most 25 results.
//   2. Rate limits: the 61st call in a minute and the 1,001st in a day are refused.
//   3. Pause / global switch refuse calls.
//   4. A revoked session's token is refused (what Disconnect does).
// Everything it creates (a hidden-address test job, an offer, two messages,
// audit rows, a pause) is removed at the end, pass or fail.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import {
  searchJobs, searchListings, getJob, getListing, myActivity, readConversation, runGatedTool, MAX_RESULTS,
} from '../shared/aiConnector.ts'

const URL = 'https://opagkgfxmjqmnvhrcris.supabase.co'
const KEY = 'sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'
const PASSWORD = 'TestPass123!'
const SECRET_ADDRESS = '42 Kahikatea Road'
const results = []

function sql(query) {
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', query, '-o', 'json'], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(out.slice(out.indexOf('{'))).rows
}

async function signIn(email, password) {
  const client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return { client, user: data.user, session: data.session, email }
}

async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('  ✔', name) }
  catch (err) { results.push(['FAIL', name, err.message]); console.log('  ✖', name, '\n     ', err.message) }
}

function noAddress(value, label) {
  const json = JSON.stringify(value)
  assert.doesNotMatch(json, /Kahikatea Road/i, `${label} leaked the street address`)
  assert.doesNotMatch(json, /"(latitude|longitude|location_name|location_note|area_polygon)"/, `${label} has location fields`)
}

const R = await signIn('test.requester@difmrural.test', PASSWORD)
const P = await signIn('test.provider@difmrural.test', PASSWORD)
const O = await signIn('test.other@difmrural.test', PASSWORD)
const members = [R, P, O]
console.log(`Signed in ${members.length} members: ${members.map(m => m.email).join(', ')}`)
const ids = members.map(m => `'${m.user.id}'`).join(',')
let jobId = null
// ai_enabled defaults to OFF in production. Remember it, turn it on only for
// this run (the gate refuses everything otherwise), and restore it afterwards.
const originalEnabled = sql('select ai_enabled from public.ai_settings where id')[0]?.ai_enabled === true
sql('update public.ai_settings set ai_enabled = true where id')

try {
  // ---- Test data: a hidden-address job by R, an offer by P, a chat between them.
  const { data: job, error: jobError } = await R.client.from('jobs').insert({
    requester_id: R.user.id, title: `[TEST] AI connector check ${Date.now()}`,
    description: `Automated AI connector test, please ignore. Gate is at ${SECRET_ADDRESS}, Waitoki.`,
    category: 'Fencing & Gates', price_type: 'fixed', price: 120, status: 'open', visibility: 'public',
    location_name: `${SECRET_ADDRESS}, Waitoki, New Zealand`, latitude: -36.6312, longitude: 174.5123,
    hide_exact_location: true, location_area: 'Waitoki', materials_type: 'requester', schedule_type: 'flexible',
  }).select('id').single()
  if (jobError) throw new Error('Could not create the test job: ' + jobError.message)
  jobId = job.id
  const { error: bidError } = await P.client.from('bids').insert({ job_id: jobId, provider_id: P.user.id, amount: 120, message: 'Test offer, please ignore.', status: 'pending' })
  if (bidError) throw new Error('Could not create the test offer: ' + bidError.message)
  for (const [from, to, content] of [[P, R, 'Test question from provider'], [R, P, `Test reply: it is ${SECRET_ADDRESS}`]]) {
    const { error } = await from.client.from('messages').insert({ job_id: jobId, sender_id: from.user.id, receiver_id: to.user.id, content })
    if (error) throw new Error('Could not create a test message: ' + error.message)
  }
  sql(`delete from public.ai_tool_calls where user_id in (${ids})`)

  console.log('\n1. Tool outputs respect RLS and the address rule')
  for (const m of members) {
    await check(`${m.email}: search_jobs/search_listings capped at ${MAX_RESULTS}, no addresses`, async () => {
      const jobs = await searchJobs(m.client, { limit: 100 })
      const listings = await searchListings(m.client, { limit: 100 })
      assert.ok(jobs.results.length <= MAX_RESULTS && listings.results.length <= MAX_RESULTS)
      noAddress(jobs, 'search_jobs'); noAddress(listings, 'search_listings')
      const hit = (await searchJobs(m.client, { query: 'AI connector check' })).results.find(j => j.id === jobId)
      assert.ok(hit, 'the open public test job should be searchable')
      assert.equal(hit.area, 'Waitoki')
      if (listings.results[0]) noAddress(await getListing(m.client, { listing_id: listings.results[0].id }), 'get_listing')
    })
    await check(`${m.email}: get_job shows the right relationship and no address`, async () => {
      const out = await getJob(m.client, m.user.id, { job_id: jobId })
      assert.equal(out.found, true)
      noAddress(out, 'get_job')
      assert.doesNotMatch(out.job.description, /Kahikatea/)
      const expected = m === R ? 'requester' : m === P ? 'offered' : 'viewer'
      assert.equal(out.job.your_role, expected)
      if (m === R) assert.equal(out.job.next_move.badge, 'Waiting on you to choose')
      if (m !== R) assert.equal(out.job.pending_offer_count, null, 'only the owner sees the offer count')
    })
    await check(`${m.email}: read_conversation only for participants, address redacted`, async () => {
      const out = await readConversation(m.client, m.user.id, { kind: 'job', id: jobId })
      if (m === O) { assert.equal(out.found, false); return }
      assert.equal(out.found, true)
      assert.equal(out.messages.length, 2)
      noAddress(out, 'read_conversation')
      assert.ok(out.messages.some(x => x.from === 'you'))
    })
    await check(`${m.email}: my_activity is the member's own work only`, async () => {
      const out = await myActivity(m.client, m.user.id, { limit: 100 })
      assert.ok(out.results.length <= MAX_RESULTS)
      noAddress(out, 'my_activity')
      const testItem = out.results.find(i => i.id === jobId)
      if (m === R) assert.equal(testItem?.your_role, 'requester')
      else if (m === P) assert.equal(testItem?.your_role, 'provider')
      else assert.equal(testItem, undefined, 'a non-participant must not see the job in their activity')
      // Bookings in the list must be ones this member is party to.
      const bookingIds = out.results.filter(i => i.type === 'booking').map(i => i.id)
      if (bookingIds.length) {
        const { data } = await m.client.from('bookings').select('id,requester_id,provider_id').in('id', bookingIds)
        for (const b of data) assert.ok([b.requester_id, b.provider_id].includes(m.user.id))
      }
    })
  }

  console.log('\n2. Rate limits trip')
  await check('60 calls a minute: call 61 is refused', async () => {
    sql(`delete from public.ai_tool_calls where user_id = '${P.user.id}'`)
    const outcomes = []
    for (let i = 0; i < 61; i++) outcomes.push(await runGatedTool(P.client, 'search_jobs', async () => ({ results: [] })))
    assert.equal(outcomes.slice(0, 60).filter(o => o.ok).length, 60)
    assert.equal(outcomes[60].ok, false)
    assert.equal(outcomes[60].reason, 'denied_minute')
  })
  await check('1,000 calls a day: the next call is refused', async () => {
    sql(`delete from public.ai_tool_calls where user_id = '${P.user.id}';
         insert into public.ai_tool_calls (user_id, tool, status, created_at)
         select '${P.user.id}', 'search_jobs', 'ok', now() - interval '2 hours' - (g * interval '1 second') from generate_series(1, 1000) g;`)
    const out = await runGatedTool(P.client, 'search_jobs', async () => ({ results: [] }))
    assert.equal(out.reason, 'denied_day')
  })
  await check('audit rows are admin-only (members read none)', async () => {
    const { data, error } = await P.client.from('ai_tool_calls').select('id').limit(5)
    assert.ok(error || data.length === 0, 'a member could read audit rows')
    const { data: settings } = await P.client.from('ai_settings').select('ai_enabled')
    assert.equal(settings?.length || 0, 0)
    const { error: adminErr } = await P.client.rpc('ai_admin_set_enabled', { p_enabled: false })
    assert.ok(adminErr, 'a member could flip the global switch')
  })

  console.log('\n3. Pause and global switch')
  sql(`delete from public.ai_tool_calls where user_id in (${ids})`)
  await check('a paused member is refused, others are not', async () => {
    sql(`insert into public.ai_member_pauses (user_id, reason) values ('${R.user.id}', 'live test') on conflict do nothing`)
    assert.equal((await runGatedTool(R.client, 'my_activity', async () => ({}))).reason, 'denied_paused')
    assert.equal((await runGatedTool(P.client, 'my_activity', async () => ({}))).ok, true)
    const { data } = await R.client.rpc('ai_connector_status')
    assert.equal(data.paused, true)
    sql(`delete from public.ai_member_pauses where user_id = '${R.user.id}'`)
    assert.equal((await runGatedTool(R.client, 'my_activity', async () => ({}))).ok, true)
  })
  await check('global ai_enabled=false refuses everyone', async () => {
    sql(`update public.ai_settings set ai_enabled = false where id`)
    try {
      for (const m of members) assert.equal((await runGatedTool(m.client, 'search_jobs', async () => ({}))).reason, 'denied_disabled')
    } finally { sql(`update public.ai_settings set ai_enabled = true where id`) } // back on for the rest of the run
    assert.equal((await runGatedTool(P.client, 'search_jobs', async () => ({}))).ok, true)
  })

  console.log('\n4. Disconnected tokens fail')
  await check('a revoked session token is refused', async () => {
    const extra = await signIn(P.email, PASSWORD)
    assert.equal((await runGatedTool(extra.client, 'search_jobs', async () => ({}))).ok, true)
    // Revoke that one session (Disconnect revokes the assistant's sessions the same way).
    sql(`delete from auth.sessions where id = '${JSON.parse(Buffer.from(extra.session.access_token.split('.')[1], 'base64url')).session_id}'`)
    const after = await runGatedTool(extra.client, 'search_jobs', async () => ({}))
    assert.equal(after.ok, false)
    assert.equal(after.reason, 'denied_session')
  })
} finally {
  if (jobId) {
    const { error } = await R.client.from('jobs').delete().eq('id', jobId)
    if (error) console.log(`⚠ Could not delete test job ${jobId}: ${error.message}`)
  }
  try {
    sql(`delete from public.ai_tool_calls where user_id in (${ids}); delete from public.ai_member_pauses where user_id in (${ids}); update public.ai_settings set ai_enabled = ${originalEnabled} where id;`)
    console.log(`ai_enabled restored to ${originalEnabled}`)
  } catch (err) { console.log('⚠ Cleanup of audit rows failed:', err.message) }
  for (const m of members) await m.client.auth.signOut({ scope: 'local' }).catch(() => {})
}

const failed = results.filter(r => r[0] === 'FAIL')
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
