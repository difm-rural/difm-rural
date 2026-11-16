// Signed-in matrix for the job-photos upload policy (uploads only into your own
// folder; transitional: <job id>/ for a job you requested). Run against the live
// project with the test accounts:
//   node tests/job-photos-policy-matrix.mjs
// Requester = test requester (owns a test job), Other = test provider, plus an
// anonymous client. Every object written is deleted at the end.
import { createRequire } from 'node:module'
const require = createRequire(new URL('../provider-web/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

const URL_ = 'https://opagkgfxmjqmnvhrcris.supabase.co'
const KEY = 'sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'
const client = () => createClient(URL_, KEY, { auth: { persistSession: false } })
const requester = client(), other = client(), anon = client()
const sa = await requester.auth.signInWithPassword({ email: 'test.requester@difmrural.test', password: 'TestPass123!' })
const sb = await other.auth.signInWithPassword({ email: 'test.provider@difmrural.test', password: 'TestPass123!' })
if (sa.error || sb.error) { console.log('sign-in failed'); process.exit(1) }
const A = sa.data.user.id, B = sb.data.user.id

const { data: jobs } = await requester.from('jobs').select('id').eq('requester_id', A).limit(1)
const job = jobs?.[0]?.id
if (!job) { console.log('the test requester has no job to test with'); process.exit(1) }

const stamp = Date.now(), newJob = crypto.randomUUID()
const paths = {
  own: `${A}/${job}/matrix_${stamp}.jpg`,
  ownThumb: `${A}/${job}/matrix_${stamp}_thumb.jpg`,
  ownNewJob: `${A}/${newJob}/matrix_${stamp}.jpg`,       // web: before the job row exists
  legacyOwnJob: `${job}/matrix_${stamp}_legacy.jpg`,     // older app builds
  otherIntoA: `${A}/${job}/matrix_${stamp}_other.jpg`,
  otherLegacy: `${job}/matrix_${stamp}_otherlegacy.jpg`,
  otherOwnChat: `${B}/${job}/matrix_${stamp}_chat.jpg`,  // a chat photo in their own folder
  anonPath: `${A}/${job}/matrix_${stamp}_anon.jpg`,
}
const bytes = text => new Blob([text], { type: 'image/jpeg' })
const bucket = c => c.storage.from('job-photos')
const publicText = async path => { const r = await fetch(`${URL_}/storage/v1/object/public/job-photos/${path}?v=${Math.random()}`); return r.ok ? await r.text() : `HTTP ${r.status}` }
const exists = async path => (await publicText(path)).startsWith('HTTP ') === false

const rows = []
async function check(who, action, expectAllowed, run, verify) {
  let allowed
  try { const result = await run(); allowed = !result?.error; if (verify) allowed = allowed && await verify() } catch { allowed = false }
  rows.push({ who, action, expected: expectAllowed ? 'allowed' : 'blocked', got: allowed ? 'allowed' : 'blocked', pass: allowed === expectAllowed })
}
const up = (c, path, text, upsert = false) => bucket(c).upload(path, bytes(text), { contentType: 'image/jpeg', upsert })

await check('requester', 'upload to own folder <user>/<job>/', true, () => up(requester, paths.own, 'v1'), () => exists(paths.own))
await check('requester', 'upload _thumb (upsert)', true, () => up(requester, paths.ownThumb, 't1', true), () => exists(paths.ownThumb))
await check('requester', 'upload for a job not yet saved (web)', true, () => up(requester, paths.ownNewJob, 'n1'), () => exists(paths.ownNewJob))
await check('requester', 'older app: <own job id>/<file>', true, () => up(requester, paths.legacyOwnJob, 'l1'), () => exists(paths.legacyOwnJob))
await check('requester', 'replace own photo (upsert)', true, () => up(requester, paths.own, 'v2', true), async () => (await publicText(paths.own)) === 'v2')
await check('anyone', 'read photo by public URL', true, async () => ({ error: (await publicText(paths.own)) === 'v2' ? null : 'no' }))
await check('other user', "upload into requester's folder", false, () => up(other, paths.otherIntoA, 'x'))
await check('other user', "older app path into someone else's job", false, () => up(other, paths.otherLegacy, 'x'))
await check('other user', 'chat photo into own folder', true, () => up(other, paths.otherOwnChat, 'c1'), () => exists(paths.otherOwnChat))
await check('other user', "overwrite requester's photo (upsert)", false, () => up(other, paths.own, 'hacked', true), async () => (await publicText(paths.own)) === 'hacked')
await check('other user', "delete requester's photo", false, async () => { await bucket(other).remove([paths.own]) }, async () => !(await exists(paths.own)))
await check('anon', 'upload', false, () => up(anon, paths.anonPath, 'x'))
await check('anon', "delete requester's photo", false, async () => { await bucket(anon).remove([paths.own]) }, async () => !(await exists(paths.own)))
await check('requester', 'delete own photo + _thumb', true, async () => bucket(requester).remove([paths.own, paths.ownThumb]), async () => !(await exists(paths.own)) && !(await exists(paths.ownThumb)))

console.log('\n| Who | Action | Expected | Got | |\n|---|---|---|---|---|')
for (const r of rows) console.log(`| ${r.who} | ${r.action} | ${r.expected} | ${r.got} | ${r.pass ? '✓ pass' : '✗ FAIL'} |`)
console.log(`\n${rows.filter(r => r.pass).length}/${rows.length} passed`)

// Clean up everything this run may have written (each deleted by its uploader).
await bucket(requester).remove([paths.own, paths.ownThumb, paths.ownNewJob, paths.legacyOwnJob]).catch(() => {})
await bucket(other).remove([paths.otherOwnChat, paths.otherIntoA, paths.otherLegacy]).catch(() => {})
const left = []
for (const path of Object.values(paths)) if (await exists(path)) left.push(path)
console.log('cleanup: leftover objects', left.length ? left : 'none')
process.exit(rows.every(r => r.pass) && !left.length ? 0 : 1)
