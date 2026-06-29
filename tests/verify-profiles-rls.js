// Verify the profiles PII lockdown end-to-end against the live Supabase project.
//
// Run BEFORE applying APPLY_PENDING.sql -> expect the cross-user PII checks to
// FAIL (this is the leak we're closing). Run AFTER applying it -> expect all
// checks to PASS.
//
//   node tests/verify-profiles-rls.js
//
// Uses the same two password test accounts as tests/e2e-job-flow.js.
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://opagkgfxmjqmnvhrcris.supabase.co'
const SUPABASE_ANON = 'sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'

const REQUESTER = { email: 'test.requester@difmrural.test', password: 'TestPass123!' }
const PROVIDER  = { email: 'test.provider@difmrural.test',  password: 'TestPass123!' }

const PII = ['phone', 'address', 'latitude', 'longitude']

function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } })
}

let pass = 0, failed = 0
function check(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  ok ? pass++ : failed++
}

async function main() {
  // Sign in both users (provider first, to learn its id).
  const prov = client()
  const { data: provSession, error: provErr } =
    await prov.auth.signInWithPassword(PROVIDER)
  if (provErr) { console.error('Provider login failed — create the test accounts (see tests/README.md):', provErr.message); process.exit(2) }
  const providerId = provSession.user.id

  const req = client()
  const { data: reqSession, error: reqErr } =
    await req.auth.signInWithPassword(REQUESTER)
  if (reqErr) { console.error('Requester login failed:', reqErr.message); process.exit(2) }
  const requesterId = reqSession.user.id

  console.log(`\nSigned in. requester=${requesterId}  provider=${providerId}\n`)

  // 1. Requester must NOT read another user's PII from the base table.
  console.log('Cross-user reads (requester -> provider):')
  {
    const { data, error } = await req
      .from('profiles').select(`id, ${PII.join(', ')}`).eq('id', providerId)
    const rows = data || []
    const leaked = rows.some(r => PII.some(c => r[c] !== null && r[c] !== undefined))
    check(rows.length === 0, 'base profiles row for another user returns nothing',
      error ? `query error: ${error.message}` : `${rows.length} row(s)`)
    check(!leaked, 'no phone/address/GPS values leak via base table',
      leaked ? `leaked: ${JSON.stringify(rows[0])}` : 'none')
  }

  // 2. Requester CAN read another user's safe columns via the public view.
  {
    const { data, error } = await req
      .from('profiles_public').select('id, full_name, avatar_url').eq('id', providerId).maybeSingle()
    check(!error && !!data, 'profiles_public returns the provider name/avatar',
      error ? `error: ${error.message}` : (data ? data.full_name : 'no row'))
  }

  // 3. The public view must not even expose PII columns.
  {
    const { error } = await req.from('profiles_public').select('phone').eq('id', providerId).maybeSingle()
    check(!!error, 'profiles_public does not expose phone (column absent)',
      error ? error.message : 'phone column was selectable!')
  }

  // 4. A user CAN still read their own PII from the base table.
  console.log('\nOwn-row read (requester -> self):')
  {
    const { data, error } = await req
      .from('profiles').select(`id, ${PII.join(', ')}`).eq('id', requesterId).maybeSingle()
    check(!error && !!data, 'own profile row (incl. PII columns) still readable',
      error ? error.message : 'ok')
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}  (${pass} passed, ${failed} failed)`)
  if (failed > 0) console.log('If you have not applied APPLY_PENDING.sql yet, failures here are the "before" baseline.')
  await Promise.all([req.auth.signOut(), prov.auth.signOut()])
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
