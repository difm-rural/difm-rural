import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../supabase/functions/marketplace-health/index.ts', import.meta.url), 'utf8')
const script = stripTypeScriptTypes(source.replace(/^import .*\r?\n/, ''))

function setup({ isAdmin = true, user = { id: 'admin' }, claimStatus = 'claimed', result = 'succeeded', finishError = null,
  abortOnFinish = false } = {}) {
  const env = new Map([
    ['SUPABASE_URL', 'http://fixture.invalid'],
    ['SUPABASE_ANON_KEY', 'public-key'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'worker-key'],
    ['MARKETPLACE_HEALTH_CRON_SECRET', 'fixture-secret'],
  ])
  const calls = []
  const logs = []
  const deadline = new AbortController()
  let budget
  let handler
  runInNewContext(script, {
    Deno: { env: { get: name => env.get(name) }, serve: fn => { handler = fn } },
    Response, TextEncoder, Uint8Array, crypto,
    AbortSignal: { any: AbortSignal.any, timeout: ms => { budget = ms; return deadline.signal } },
    console: { error: message => logs.push(JSON.parse(message)) },
    fetch: async (_url, init) => { init.signal.throwIfAborted(); return new Response() },
    createClient: (_url, key, options) => {
      if (key === 'public-key') {
        return {
          auth: { getUser: async token => ({ data: { user: token === 'valid' ? user : null } }) },
          rpc: async name => {
            assert.equal(name, 'current_user_is_admin')
            return { data: isAdmin }
          },
        }
      }
      assert.equal(key, 'worker-key')
      return {
        rpc: async (name, args) => {
          calls.push([name, { ...args }])
          if (name === 'marketplace_health_claim') {
            return { data: { status: claimStatus, run_date: '2026-11-16', claim_id: 'claim' } }
          }
          assert.equal(name, 'marketplace_health_finish')
          if (abortOnFinish) {
            deadline.abort()
            await options.global.fetch('http://fixture.invalid')
          }
          return { data: result, error: finishError }
        },
      }
    },
  })
  return {
    calls,
    logs,
    budget: () => budget,
    send: (headers, method = 'POST') => handler(new Request('http://fixture.invalid', { method, headers })),
  }
}

test('method, authentication and authorisation fail before worker access', async () => {
  const { send, calls } = setup({ isAdmin: false })
  assert.equal((await send({}, 'GET')).status, 405)
  assert.equal((await send({})).status, 401)
  assert.equal((await send({ Authorization: 'Bearer invalid' })).status, 401)
  assert.equal((await send({ Authorization: 'Bearer valid' })).status, 403)
  assert.equal((await send({ 'x-marketplace-health-secret': 'wrong' })).status, 401)
  assert.deepEqual(calls, [])
})

test('both execution paths keep claims and report data out of responses', async () => {
  const { send, calls } = setup()
  const admin = await send({ Authorization: 'Bearer valid' })
  const cron = await send({ 'x-marketplace-health-secret': 'fixture-secret' })
  assert.deepEqual(await admin.json(), { status: 'succeeded' })
  assert.deepEqual(await cron.json(), { status: 'succeeded' })
  assert.equal(cron.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(calls, [
    ['marketplace_health_claim', { p_source: 'manual' }],
    ['marketplace_health_finish', { p_day: '2026-11-16', p_source: 'manual', p_claim: 'claim' }],
    ['marketplace_health_claim', { p_source: 'scheduled' }],
    ['marketplace_health_finish', { p_day: '2026-11-16', p_source: 'scheduled', p_claim: 'claim' }],
  ])
})

test('duplicates skip work and failed results expose only the operational status', async () => {
  const headers = { Authorization: 'Bearer valid' }
  const duplicate = setup({ claimStatus: 'already_succeeded' })
  assert.deepEqual(await (await duplicate.send(headers)).json(), { status: 'already_succeeded' })
  assert.equal(duplicate.calls.length, 1)
  const failed = await setup({ result: 'failed' }).send(headers)
  assert.equal(failed.status, 503)
  assert.deepEqual(await failed.json(), { status: 'failed' })
  const timeout = await setup({ finishError: { message: 'private error' } }).send(headers)
  assert.equal(timeout.status, 503)
  assert.deepEqual(await timeout.json(), { status: 'interrupted' })
})

test('the shared HTTP deadline interrupts finish and logs safe diagnostics', async () => {
  const fixture = setup({ abortOnFinish: true })
  const response = await fixture.send({ Authorization: 'Bearer valid' })
  assert.equal(fixture.budget(), 24_000)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { status: 'interrupted' })
  assert.deepEqual(fixture.logs, [{
    event: 'marketplace_health_error', stage: 'finish', status: 'interrupted', timed_out: true,
  }])
})
