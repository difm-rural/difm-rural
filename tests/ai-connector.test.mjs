import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_RESULTS, clampLimit, searchTerm, categoryFilter, redactAddresses, jobArea, listingArea,
  searchJobs, searchListings, getJob, getListing, myActivity, readConversation, requireUuid, ToolInputError,
} from '../shared/aiConnector.ts'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const THIRD = '33333333-3333-4333-8333-333333333333'
const JOB = '44444444-4444-4444-8444-444444444444'
const LISTING = '55555555-5555-4555-8555-555555555555'

// A recording stand-in for supabase-js: from(table) → chainable builder that
// resolves to rows[table] (or a function of the recorded filters).
function fakeClient(rows = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, ops: [] }
      calls.push(call)
      const builder = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') {
            const source = rows[table]
            const data = typeof source === 'function' ? source(call) : (source ?? [])
            return (resolve) => resolve({ data, error: null })
          }
          if (prop === 'maybeSingle') return () => {
            call.ops.push(['maybeSingle'])
            const source = rows[table]
            const data = typeof source === 'function' ? source(call) : source
            return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : (data ?? null), error: null })
          }
          return (...args) => { call.ops.push([prop, ...args]); return builder }
        },
      })
      return builder
    },
  }
}
const op = (call, name) => call.ops.filter(o => o[0] === name)

test('limits clamp to 1..25', () => {
  assert.equal(clampLimit(undefined), 10)
  assert.equal(clampLimit(0), 10)
  assert.equal(clampLimit(5), 5)
  assert.equal(clampLimit(500), MAX_RESULTS)
  assert.equal(clampLimit('nope'), 10)
})

test('search terms cannot inject PostgREST filter syntax', () => {
  assert.equal(searchTerm('fence),status.eq.cancelled,(x'), 'fence status eq cancelled x')
  assert.equal(searchTerm('*%_\\'), '')
  assert.equal(searchTerm('Te Kūiti'), 'Te Kūiti')
  assert.ok(searchTerm('a'.repeat(200)).length <= 80)
  assert.equal(categoryFilter('fencing & gates'), 'Fencing & Gates')
  assert.equal(categoryFilter('  Grazing '), 'Grazing')
})

test('exact addresses and pins never appear in output text', () => {
  const text = 'Gate code 1234. Come to 42 Rata Road, Waitoki or 7/12B Old Coach Rd. Pin -36.6012, 174.6123 https://maps.app.goo.gl/abc RD 3'
  const out = redactAddresses(text)
  assert.doesNotMatch(out, /42 Rata|Old Coach|-36\.6012|goo\.gl|RD 3/)
  assert.match(out, /Waitoki/)
  assert.equal(jobArea({ location_area: null, location_name: '42 Rata Road, Waitoki, New Zealand' }), 'Waitoki')
  assert.equal(jobArea({ location_area: 'Near Kaukapakapa', location_name: '1 Secret Lane, Kaukapakapa' }), 'Near Kaukapakapa')
  assert.equal(listingArea({ location_name: '5 Main Street' }), null)
})

test('uuid inputs are validated', () => {
  assert.throws(() => requireUuid('1 or 1=1'), ToolInputError)
  assert.equal(requireUuid(JOB.toUpperCase()), JOB)
})

test('search_jobs reads jobs_public only, open + public, and drops address fields', async () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `id-${i}`, title: 'Fence', location_name: '9 Hidden Road, Helensville', latitude: -36.6, longitude: 174.4, location_area: null, status: 'open' }))
  const client = fakeClient({ jobs_public: many })
  const out = await searchJobs(client, { query: 'fence', limit: 100 })
  assert.equal(out.results.length, MAX_RESULTS)
  const call = client.calls[0]
  assert.equal(call.table, 'jobs_public')
  assert.deepEqual(op(call, 'eq'), [['eq', 'status', 'open'], ['eq', 'visibility', 'public']])
  assert.deepEqual(op(call, 'limit'), [['limit', 25]])
  const json = JSON.stringify(out)
  assert.doesNotMatch(json, /Hidden Road|latitude|longitude|174\.4/)
  assert.equal(out.results[0].area, 'Helensville')
  assert.ok(!client.calls.some(c => c.table === 'jobs'))
})

test('search_listings filters active, open listings and shows the provider first name only', async () => {
  const client = fakeClient({
    services: [{ id: LISTING, provider_id: OTHER, title: 'Drone spraying', location_name: '12 Kahikatea Drive, Te Awamutu', latitude: -38, longitude: 175 }],
    profiles_public: [{ id: OTHER, full_name: 'Sam Provider' }],
  })
  const out = await searchListings(client, { category: 'spraying & pest control' })
  const call = client.calls[0]
  assert.deepEqual(op(call, 'eq'), [['eq', 'is_active', true], ['eq', 'category', 'Spraying & Pest Control']])
  assert.deepEqual(op(call, 'is'), [['is', 'closed_at', null]])
  assert.equal(out.results[0].provider, 'Sam')
  assert.equal(out.results[0].area, 'Te Awamutu')
  assert.doesNotMatch(JSON.stringify(out), /Kahikatea|-38|175/)
})

test('get_job reports the viewer relationship and a next move from shared/nextMove', async () => {
  const client = fakeClient({
    jobs_public: [{ id: JOB, requester_id: ME, title: 'Fix gate', status: 'open', description: 'At 3 Totara Street', location_area: 'Kumeū' }],
    bids: call => op(call, 'eq').some(o => o[1] === 'provider_id') ? [] : [{ id: 'b1' }, { id: 'b2' }],
    profiles_public: [],
  })
  const out = await getJob(client, ME, { job_id: JOB })
  assert.equal(out.job.your_role, 'requester')
  assert.equal(out.job.pending_offer_count, 2)
  assert.equal(out.job.next_move.badge, 'Waiting on you to choose')
  assert.doesNotMatch(out.job.description, /Totara/)
  assert.equal(out.job.area, 'Kumeū')
})

test('get_listing returns found:false when RLS hides it', async () => {
  const out = await getListing(fakeClient({ services: null }), { listing_id: LISTING })
  assert.deepEqual(out, { found: false, listing_id: LISTING })
})

test('my_activity uses explicit participant filters and nextMove badges', async () => {
  const client = fakeClient({
    jobs_public: call => op(call, 'eq').some(o => o[1] === 'requester_id')
      ? [{ id: JOB, requester_id: ME, title: 'Fix gate', status: 'open', created_at: '2026-11-01' }]
      : [],
    bookings: call => op(call, 'eq').some(o => o[1] === 'provider_id')
      ? [{ id: 'bk1', service_id: LISTING, requester_id: OTHER, provider_id: ME, status: 'pending', created_at: '2026-11-02' }]
      : [],
    bids: call => op(call, 'in').some(o => o[1] === 'job_id') ? [{ job_id: JOB }] : [],
    job_questions: [],
    services: [{ id: LISTING, title: 'Fencing', pricing_type: 'hourly' }],
    profiles_public: [{ id: OTHER, full_name: 'Robin Requester' }],
  })
  const out = await myActivity(client, ME, {})
  assert.equal(out.results.length, 2)
  assert.ok(out.results.every(r => r.needs_your_action))
  const booking = out.results.find(r => r.type === 'booking')
  assert.equal(booking.other_party, 'Robin')
  assert.equal(booking.badge, 'Waiting on you to respond')
  const own = client.calls.filter(c => ['jobs_public', 'bookings'].includes(c.table) && op(c, 'in').every(o => o[1] !== 'id'))
  for (const c of own) assert.ok(op(c, 'eq').some(o => [ 'requester_id', 'provider_id' ].includes(o[1]) && o[2] === ME), c.table)
})

test('read_conversation keeps only messages the member is part of and redacts addresses', async () => {
  const client = fakeClient({
    messages: [
      { id: 'm2', sender_id: OTHER, receiver_id: ME, content: 'I am at 18 Kauri Lane, Puhoi', created_at: '2026-11-02' },
      { id: 'm1', sender_id: ME, receiver_id: OTHER, content: 'Hi', created_at: '2026-11-01' },
      { id: 'mx', sender_id: OTHER, receiver_id: THIRD, content: 'Not yours', created_at: '2026-11-03' },
    ],
    jobs_public: [{ id: JOB, title: 'Fix gate' }],
    profiles_public: [{ id: OTHER, full_name: 'Sam Provider' }],
  })
  const out = await readConversation(client, ME, { kind: 'job', id: JOB, limit: 99 })
  assert.equal(out.messages.length, 2)
  assert.deepEqual(out.messages.map(m => m.from), ['you', 'Sam'])
  assert.doesNotMatch(JSON.stringify(out), /Kauri|Not yours/)
  const msgCall = client.calls.find(c => c.table === 'messages')
  assert.deepEqual(op(msgCall, 'limit'), [['limit', 25]])
  assert.ok(op(msgCall, 'or')[0][1].includes(`sender_id.eq.${ME}`))
})

test('read_conversation checks booking membership first', async () => {
  const client = fakeClient({ bookings: null })
  const out = await readConversation(client, ME, { kind: 'booking', id: JOB })
  assert.equal(out.found, false)
  assert.ok(!client.calls.some(c => c.table === 'service_booking_messages'))
  await assert.rejects(() => readConversation(client, ME, { kind: 'email', id: JOB }), ToolInputError)
})

// ---------------------------------------------------------------------------
// Gate, consent helpers and static guarantees
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs'
import { runGatedTool, gateMessage } from '../shared/aiConnector.ts'
import { connectedAssistants, assistantName, redirectHost } from '../shared/connectedAssistants.ts'

function rpcClient(decision) {
  const calls = []
  return { calls, rpc: async (fn, args) => { calls.push([fn, args]); return fn === 'ai_begin_tool_call' ? { data: decision, error: null } : { data: null, error: null } } }
}

test('a refused gate never runs the tool and explains why', async () => {
  for (const reason of ['denied_minute', 'denied_day', 'denied_paused', 'denied_disabled', 'denied_session']) {
    const client = rpcClient({ allowed: false, reason, call_id: 1, retry_after_seconds: 60 })
    let ran = false
    const out = await runGatedTool(client, 'search_jobs', async () => { ran = true })
    assert.equal(ran, false)
    assert.equal(out.ok, false)
    assert.equal(out.message, gateMessage(reason, 60))
    assert.deepEqual(client.calls.map(c => c[0]), ['ai_begin_tool_call'])
  }
  assert.match(gateMessage('denied_minute', 60), /60 .*a minute/)
  assert.match(gateMessage('denied_day'), /1,000/)
})

test('an allowed call is finished with its result count, and errors are not leaked', async () => {
  const ok = rpcClient({ allowed: true, reason: 'started', call_id: 7 })
  const out = await runGatedTool(ok, 'search_jobs', async () => ({ results: [1, 2, 3] }), (() => { let t = 0; return () => (t += 5) })())
  assert.equal(out.ok, true)
  assert.deepEqual(ok.calls[1], ['ai_finish_tool_call', { p_call_id: 7, p_ok: true, p_result_count: 3, p_duration_ms: 5 }])
  const bad = rpcClient({ allowed: true, reason: 'started', call_id: 8 })
  const failed = await runGatedTool(bad, 'get_job', async () => { throw new Error('relation "secret" does not exist') })
  assert.equal(failed.ok, false)
  assert.doesNotMatch(failed.message, /secret/)
  assert.equal(bad.calls[1][1].p_ok, false)
  const gateDown = await runGatedTool({ rpc: async () => ({ data: null, error: { message: 'x' } }) }, 'get_job', async () => 1)
  assert.equal(gateDown.ok, false)
})

test('connected assistants list is cleaned and newest first', () => {
  const list = connectedAssistants([
    { client: { id: 'a', name: '<b>Old</b>', uri: 'https://old.example/x' }, granted_at: '2026-01-01T00:00:00Z' },
    { client: { id: 'b', name: '  Claude  ', uri: 'javascript:alert(1)' }, granted_at: '2026-11-01T00:00:00Z' },
    { client: null },
  ])
  assert.deepEqual(list.map(a => a.clientId), ['b', 'a'])
  assert.equal(list[0].name, 'Claude')
  assert.equal(list[0].website, null)
  assert.equal(list[1].website, 'old.example')
  assert.equal(assistantName(''), 'An AI assistant')
  assert.equal(redirectHost('http://localhost:6274/cb'), 'localhost:6274')
})

test('rc-mcp has no service-role client and reads jobs only through jobs_public', () => {
  const files = ['index.ts', 'tools.ts', 'connector.ts'].map(f => readFileSync(new URL('../supabase/functions/rc-mcp/' + f, import.meta.url), 'utf8'))
  const shared = readFileSync(new URL('../shared/aiConnector.ts', import.meta.url), 'utf8')
  for (const source of [...files, shared]) {
    assert.doesNotMatch(source, /SERVICE_ROLE|supabaseAdmin|secret_key/i)
    assert.doesNotMatch(source, /from\(\s*['"]jobs['"]\s*\)/)
    assert.doesNotMatch(source, /jobs\s*\(\s*\*?\s*\)|jobs!inner/)
    assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(/)
  }
  assert.match(files[0], /withSupabase\(\{ auth: 'user'/)
  assert.match(files[0], /client_id/)
})

test('AI access starts OFF and assistant tokens are read-only in the database', () => {
  const connector = readFileSync(new URL('../supabase/migrations/20261118190000_ai_connector.sql', import.meta.url), 'utf8')
  assert.match(connector, /ai_enabled boolean not null default false/)
  const guard = readFileSync(new URL('../supabase/migrations/20261118200000_assistant_tokens_read_only.sql', import.meta.url), 'utf8')
  assert.match(guard, /select \(auth\.jwt\(\) ->> 'client_id'\) is not null/)
  const functions = [...guard.matchAll(/^CREATE OR REPLACE FUNCTION (public\.\w+)/gm)].map(m => m[1])
  assert.equal(functions.length, 19)
  assert.equal((guard.match(/perform public\.refuse_assistant_token\(\);/g) || []).length, 19)
  for (const fn of ['accept_job_offer', 'confirm_job', 'mark_job_payment_sorted', 'set_job_payment_method', 'set_work_arrival_window', 'ai_admin_set_enabled']) assert.ok(functions.includes('public.' + fn), fn)
  assert.ok(!functions.includes('public.ai_begin_tool_call'), 'the rc-mcp gate must stay callable')
  for (const table of ['public.jobs', 'public.bids', 'public.bookings', 'public.messages', 'public.profiles', 'storage.objects']) {
    for (const cmd of ['insert', 'update', 'delete']) assert.ok(guard.includes(`"Assistants cannot ${cmd}" on ${table} as restrictive`), `${table} ${cmd}`)
  }
})

test('public-web forwards /oauth/consent to the console consent screen', async () => {
  const { GET } = await import('../public-web/src/app/oauth/consent/route.ts')
  const ok = GET(new Request('https://ruralconnections.nz/oauth/consent?authorization_id=abc_DEF-123456'))
  assert.equal(ok.status, 302)
  assert.equal(ok.headers.get('location'), 'https://dev.ruralconnections.nz/oauth/consent?authorization_id=abc_DEF-123456')
  const bad = GET(new Request('https://ruralconnections.nz/oauth/consent?authorization_id=%22%3E%3Cscript%3E'))
  assert.equal(bad.headers.get('location'), 'https://dev.ruralconnections.nz/oauth/consent')
})
