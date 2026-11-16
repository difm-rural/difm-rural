// Signed-in matrix for the service-photos owner-only policies.
// Owner = test provider, Other = test requester, plus an anonymous client.
// Creates a temporary paused listing for the owner if they have none, and
// deletes every test object (and that listing) at the end.
import { createRequire } from 'node:module'
const require = createRequire('file:///C:/Users/OEM/difm-rural/provider-web/package.json')
const { createClient } = require('@supabase/supabase-js')

const URL = 'https://opagkgfxmjqmnvhrcris.supabase.co'
const KEY = 'sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'
const client = () => createClient(URL, KEY, { auth: { persistSession: false } })
const owner = client(), other = client(), anon = client()
const so = await owner.auth.signInWithPassword({ email: 'test.provider@difmrural.test', password: 'TestPass123!' })
const sr = await other.auth.signInWithPassword({ email: 'test.requester@difmrural.test', password: 'TestPass123!' })
if (so.error || sr.error) { console.log('sign-in failed'); process.exit(1) }
const OWNER = so.data.user.id

// A listing the owner owns (temporary and paused if needed).
let created = null
let { data: own } = await owner.from('services').select('id').eq('provider_id', OWNER).limit(1)
let svc = own?.[0]?.id
if (!svc) {
  const { data, error } = await owner.from('services').insert({ provider_id: OWNER, title: 'TEST photo policy matrix', category: 'General Rural Help', kind: 'service', direction: 'offering', pricing_type: 'fixed', rate: 1, location_name: 'Waitoki', is_active: false, payment_timing: 'on_completion', materials: 'included' }).select('id').single()
  if (error) { console.log('listing insert failed', error.message); process.exit(1) }
  svc = created = data.id
}
const stamp = Date.now()
const photo = `${svc}/matrix_${stamp}.jpg`, thumb = `${svc}/matrix_${stamp}_thumb.jpg`
const strangerPath = `${svc}/matrix_${stamp}_other.jpg`, notListing = `00000000-0000-4000-8000-${String(stamp).slice(-12)}/matrix.jpg`
const bytes = text => new Blob([text], { type: 'image/jpeg' })
const bucket = c => c.storage.from('service-photos')
const exists = async path => {
  const folder = path.split('/').slice(0, -1).join('/'), name = path.split('/').pop()
  const { data } = await bucket(owner).list(folder, { search: name })
  return (data || []).some(o => o.name === name)
}
const publicText = async path => { const r = await fetch(`${URL}/storage/v1/object/public/service-photos/${path}?v=${Math.random()}`); return r.ok ? await r.text() : `HTTP ${r.status}` }

const rows = []
async function check(who, action, expectAllowed, run, verify) {
  let allowed
  try { const result = await run(); allowed = !result?.error; if (verify) allowed = allowed && await verify() } catch { allowed = false }
  rows.push({ who, action, expected: expectAllowed ? 'allowed' : 'blocked', got: allowed ? 'allowed' : 'blocked', pass: allowed === expectAllowed })
}

// Owner
await check('owner', 'upload photo', true, () => bucket(owner).upload(photo, bytes('v1'), { contentType: 'image/jpeg', upsert: false }), () => exists(photo))
await check('owner', 'upload _thumb', true, () => bucket(owner).upload(thumb, bytes('t1'), { contentType: 'image/jpeg', upsert: true }), () => exists(thumb))
await check('owner', 'replace photo (upsert)', true, () => bucket(owner).upload(photo, bytes('v2'), { contentType: 'image/jpeg', upsert: true }), async () => (await publicText(photo)) === 'v2')
await check('owner', 'upload into a folder that is not a listing', false, () => bucket(owner).upload(notListing, bytes('x'), { contentType: 'image/jpeg' }))
// Public read
await check('anyone', 'read photo by public URL', true, async () => ({ error: (await publicText(photo)) === 'v2' ? null : 'no' }))
// Another signed-in user
await check('other user', 'upload into the listing folder', false, () => bucket(other).upload(strangerPath, bytes('x'), { contentType: 'image/jpeg' }))
await check('other user', 'overwrite owner photo (upsert)', false, () => bucket(other).upload(photo, bytes('hacked'), { contentType: 'image/jpeg', upsert: true }), async () => (await publicText(photo)) === 'hacked')
await check('other user', 'delete owner photo', false, async () => { await bucket(other).remove([photo]) }, async () => !(await exists(photo)))
await check('other user', 'delete owner _thumb', false, async () => { await bucket(other).remove([thumb]) }, async () => !(await exists(thumb)))
// Anonymous
await check('anon', 'upload into the listing folder', false, () => bucket(anon).upload(`${svc}/matrix_${stamp}_anon.jpg`, bytes('x'), { contentType: 'image/jpeg' }))
await check('anon', 'delete owner photo', false, async () => { await bucket(anon).remove([photo]) }, async () => !(await exists(photo)))
await check('anon', 'read photo by public URL', true, async () => ({ error: (await publicText(photo)) === 'v2' ? null : 'no' }))
// Owner deletes both (last, after the others failed to)
await check('owner', 'delete photo + _thumb', true, async () => bucket(owner).remove([photo, thumb]), async () => !(await exists(photo)) && !(await exists(thumb)))

console.log('\n| Who | Action | Expected | Got | |\n|---|---|---|---|---|')
for (const r of rows) console.log(`| ${r.who} | ${r.action} | ${r.expected} | ${r.got} | ${r.pass ? '✓ pass' : '✗ FAIL'} |`)
console.log(`\n${rows.filter(r => r.pass).length}/${rows.length} passed`)

// Clean up anything that may have been written, and the temporary listing.
await bucket(owner).remove([photo, thumb, strangerPath, `${svc}/matrix_${stamp}_anon.jpg`]).catch(() => {})
if (created) await owner.from('services').delete().eq('id', created)
console.log('cleanup:', JSON.stringify({ listingCreated: !!created, svcFolder: svc, leftover: [await exists(photo), await exists(thumb), await exists(strangerPath)] }))
process.exit(0)
