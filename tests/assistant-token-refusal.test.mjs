import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isAssistantRequest, refuseAssistantToken, ASSISTANT_READ_ONLY } from '../supabase/functions/_shared/assistant-token.ts'

const jwt = claims => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.')
const req = token => new Request('https://x.test/', { method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {} })

test('tokens with a client_id claim are refused with 403', async () => {
  const response = refuseAssistantToken(req(jwt({ sub: 'u', role: 'authenticated', client_id: 'c0ffee' })), { 'Access-Control-Allow-Origin': '*' })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.equal((await response.json()).message, ASSISTANT_READ_ONLY)
})

test('member sessions, anon keys and non-JWTs pass through', () => {
  assert.equal(isAssistantRequest(req(jwt({ sub: 'u', role: 'authenticated' }))), false)
  assert.equal(isAssistantRequest(req(jwt({ sub: 'u', client_id: '' }))), false)
  assert.equal(isAssistantRequest(req('sb_publishable_abc')), false)
  assert.equal(isAssistantRequest(req('approved-test-token')), false)
  assert.equal(isAssistantRequest(req(null)), false)
  assert.equal(isAssistantRequest(req('a.@@@.c')), false)
})

test('all six member-acting functions refuse assistant tokens before doing work', () => {
  for (const fn of ['draft-job-from-text', 'draft-job-from-photo', 'categorize-job', 'create-service-draft-from-photo', 'maps-proxy', 'marketplace-health']) {
    const source = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8')
    assert.match(source, /import \{ refuseAssistantToken \} from '\.\.\/_shared\/assistant-token\.ts'/, fn)
    const serve = source.indexOf('Deno.serve(')
    const refusal = source.indexOf('refuseAssistantToken(', serve)
    assert.ok(refusal > serve, fn)
    for (const work of ['OPENAI_API_KEY', 'GOOGLE_MAPS_API_KEY', 'getUser(', 'createClient(']) {
      const at = source.indexOf(work, serve)
      if (at > -1) assert.ok(refusal < at, `${fn}: refusal must come before ${work}`)
    }
  }
})
