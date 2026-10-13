import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const source = await readFile(new URL('../src/lib/onboarding.js', import.meta.url), 'utf8')
const { completeOnboarding, onboardingPublicProfile, ONBOARDING_DESTINATIONS } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

function client({ user = { id: 'tester' }, authError = null, result = { data: { id: 'tester' }, error: null } } = {}) {
  const calls = []
  const chain = {
    update(value) { calls.push(['update', value]); return chain },
    eq(key, value) { calls.push(['eq', key, value]); return chain },
    select(value) { calls.push(['select', value]); return chain },
    async single() { return result },
  }
  return { calls, auth: { async getUser() { return { data: { user }, error: authError } } },
    from(table) { calls.push(['from', table]); return chain } }
}

test('a single public name is saved consistently without touching deferred profile fields', () => {
  assert.deepEqual(onboardingPublicProfile('  Sam’s Farm  ', 'Warkworth'), {
    full_name: 'Sam’s Farm', display_name: 'Sam’s Farm',
  })
  assert.throws(() => onboardingPublicProfile(' ', 'Warkworth'), /name you want others to see/)
  assert.throws(() => onboardingPublicProfile('Sam', ' '), /town or region/)
})

test('completion persists both roles and requires a matching saved profile', async () => {
  const supabase = client()
  await completeOnboarding(supabase)
  assert.deepEqual(supabase.calls, [
    ['from', 'profiles'], ['update', { onboarding_completed: true, primary_role: 'both', role: 'provider' }],
    ['eq', 'id', 'tester'], ['select', 'id'],
  ])
})

test('signed-out or failed authentication cannot complete setup', async () => {
  const signedOut = client({ user: null })
  await assert.rejects(completeOnboarding(signedOut), /sign in again/)
  assert.deepEqual(signedOut.calls, [])
  await assert.rejects(completeOnboarding(client({ authError: new Error('Offline') })), /Offline/)
})

test('failed and zero-row updates reject completion and allow a later retry', async () => {
  const supabase = client({ result: { data: null, error: new Error('Offline') } })
  await assert.rejects(completeOnboarding(supabase), /Offline/)
  await assert.rejects(completeOnboarding(client({ result: { data: null, error: null } })), /could not be saved/)
  await completeOnboarding(client())
})

test('each completion action targets its named destination', () => {
  assert.deepEqual(ONBOARDING_DESTINATIONS.post_job, { tab: 'Jobs', screen: 'PostJob', params: { origin: 'Home' } })
  assert.deepEqual(ONBOARDING_DESTINATIONS.listings, { tab: 'Browse', screen: 'BrowseMain' })
  assert.deepEqual(ONBOARDING_DESTINATIONS.home, { tab: 'Home', screen: 'Dashboard' })
})
