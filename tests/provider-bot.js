// ─────────────────────────────────────────────────────────────────────────────
//  Provider test bot
//
//  A headless "provider" that helps you test the requester side end to end.
//  Leave it running (`node tests/provider-bot.js`) while you post jobs in the
//  app. For each open job in the categories you watch, it will:
//    1. ask a public question on the job        → you answer it in the app
//    2. once you answer, send an offer (a bid)   → you accept it in the app
//    3. once accepted, message you in the chat    → you reply in the chat
//    4. after a short delay, mark the job complete→ you confirm it in the app
//
//  It signs in as the provider test account (password login) so RLS applies
//  exactly as for a real provider. It never touches jobs you didn't post to it,
//  and it re-derives what to do from the database each poll, so it's safe to
//  stop and restart at any time.
//
//  Seed sample jobs (one-shot): `node tests/provider-bot.js --seed` posts a
//  spread of sample jobs so the board has other-user listings to look at, then
//  exits. View the board from a DIFFERENT account to see them.
//
//  Setup (one-off): create the provider account (see tests/e2e-job-flow.js) and
//  make sure its profile has primary_role = 'provider' (or 'both').
//
//  Run multiple providers: copy this file, change PROVIDER + the message text,
//  and run each in its own terminal to simulate competing offers.
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js')

// ── Config — edit these ──────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://opagkgfxmjqmnvhrcris.supabase.co'
const SUPABASE_ANON = 'sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'

const PROVIDER = { email: 'test.provider@difmrural.test', password: 'TestPass123!' }

// The job categories this provider will respond to (must match the app's
// unified CATEGORIES exactly). Add/remove to taste.
const WATCH_CATEGORIES = [
  'Fencing & Gates', 'Animals & Farm Sitting', 'Water & Drainage',
  'Spraying & Pest Control', 'Machinery & Repairs', 'Transport & Delivery',
  'General Rural Help',
]

// Sample jobs for `--seed` mode — posts a spread of other-user listings so the
// Jobs board has something to show (real accounts hide their own jobs from the
// board). North Canterbury locations so GPS distance/sort works.
const SAMPLE_JOBS = [
  { title: 'Replace 200m boundary fence', category: 'Fencing & Gates', price_type: 'fixed', price: 1800, location_name: 'Culverden, North Canterbury', location_area: 'Culverden', latitude: -42.7833, longitude: 172.8500, description: 'Old post-and-wire boundary fence is down after the storm. About 200m to replace along a flat paddock edge. Good vehicle access.' },
  { title: 'Clear blocked farm drain', category: 'Water & Drainage', price_type: 'fixed', price: 350, location_name: 'Waiau', location_area: 'Waiau', latitude: -42.6500, longitude: 173.0500, description: 'Culvert and open drain blocked with silt after heavy rain. Need it cleared before the next downpour.' },
  { title: 'Feed & check lifestyle-block animals, 2 weeks', category: 'Animals & Farm Sitting', price_type: 'open', price: null, location_name: 'Hanmer Springs', location_area: 'Hanmer Springs', latitude: -42.5200, longitude: 172.8300, description: 'Away for two weeks over the school holidays. A few sheep, chooks and two dogs to feed and check daily.' },
  { title: "Quad bike won't start", category: 'Machinery & Repairs', price_type: 'open', price: null, location_name: 'Culverden', location_area: 'Culverden', latitude: -42.7900, longitude: 172.8600, description: 'Farm quad turns over but won\'t fire. After someone who can take a look and hopefully sort it on site.' },
  { title: 'Gorse spraying, 3ha block', category: 'Spraying & Pest Control', price_type: 'fixed', price: 600, location_name: 'Waikari', location_area: 'Waikari', latitude: -42.9600, longitude: 172.6800, description: 'Roughly 3ha of regenerating gorse on a hillside block. Need it sprayed before it seeds.' },
  { title: 'Cart 40 bales to the yards', category: 'Transport & Delivery', price_type: 'fixed', price: 250, location_name: 'Rotherham', location_area: 'Rotherham', latitude: -42.7000, longitude: 172.9600, description: 'Move 40 small square bales from the shed to the yards, about 4km up the road. Trailer or truck needed.' },
  { title: 'Regrade the driveway before winter', category: 'Earthworks & Driveways', price_type: 'open', price: null, location_name: 'Culverden', location_area: 'Culverden', latitude: -42.7800, longitude: 172.8400, description: 'Long gravel driveway is rutted and holds water. Would like it regraded and a bit more metal spread.' },
  { title: "Weekly house check while we're away", category: 'Property & House Sitting', price_type: 'open', price: null, hide_exact_location: true, location_name: '18 Douglas Road, Amberley', location_area: 'Near Amberley', latitude: -43.1500, longitude: 172.7300, description: 'Overseas for a month. After weekly checks of the house and garden, mail collected, and a look over the section.' },
]

const POLL_MS            = 6000    // how often to check for new jobs / replies
const COMPLETE_DELAY_MS  = 45000   // wait after your chat reply before marking done
const DEFAULT_BID        = 150     // used when the job has no fixed price

const QUESTION_TEXT = 'Keen to help with this. Is there vehicle access to the site, and is the timing flexible?'
const BID_MESSAGE   = "Happy to take this on — I've done plenty of similar work nearby and can start soon."
const CHAT_TEXT     = "Thanks for accepting! I'll get this sorted. Anything I should know before I head out — gate codes, dogs, where to park?"

// ── Internals ────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: true },
})

let me = null
let busy = false
const lastState = new Map()   // job_id -> last logged state (dedupes console spam)
const readyAt   = new Map()   // job_id -> timestamp we're allowed to complete

function log(jobId, state, msg) {
  if (lastState.get(jobId) === state) return
  lastState.set(jobId, state)
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`)
}

function bidAmount(job) {
  return job.price_type === 'fixed' && job.price ? Number(job.price) : DEFAULT_BID
}

async function handleOpenJob(job) {
  // 1. Question
  const { data: qs } = await supabase
    .from('job_questions').select('id, answer').eq('job_id', job.id).eq('asker_id', me).limit(1)
  const q = qs && qs[0]

  if (!q) {
    const { error } = await supabase.from('job_questions').insert({ job_id: job.id, asker_id: me, question: QUESTION_TEXT })
    if (error) return log(job.id, 'q_err', `⚠️  Could not ask a question on "${job.title}": ${error.message}`)
    return log(job.id, 'asked', `❓ Asked a question on "${job.title}".  → Answer it in the app (Job Q&A).`)
  }
  if (!q.answer) return log(job.id, 'wait_answer', `⏳ Waiting for your answer on "${job.title}"…`)

  // 2. Offer
  const { data: bids } = await supabase
    .from('bids').select('id').eq('job_id', job.id).eq('provider_id', me).limit(1)
  if (!bids || bids.length === 0) {
    const amount = bidAmount(job)
    const { error } = await supabase.from('bids').insert({
      job_id: job.id, provider_id: me, amount, message: BID_MESSAGE,
      status: 'pending', pricing_type: 'fixed', materials: 'included',
    })
    if (error) return log(job.id, 'bid_err', `⚠️  Could not offer on "${job.title}": ${error.message}`)
    return log(job.id, 'offered', `💰 Your answer came through — sent an offer of $${amount} on "${job.title}".  → Accept it in the app.`)
  }
  return log(job.id, 'wait_accept', `⏳ Waiting for you to accept my offer on "${job.title}"…`)
}

async function handleEngagedJob(job) {
  if (job.status === 'completed') return log(job.id, 'confirmed', `🎉 "${job.title}" is fully complete — nice one.`)
  if (job.status === 'awaiting_completion') return log(job.id, 'done', `✅ Marked "${job.title}" complete.  → Confirm it in the app to finalise.`)

  // 3. Chat message (only once)
  const { data: mine } = await supabase
    .from('messages').select('created_at').eq('job_id', job.id).eq('sender_id', me)
    .order('created_at', { ascending: true }).limit(1)
  if (!mine || mine.length === 0) {
    const { error } = await supabase.from('messages').insert({
      job_id: job.id, sender_id: me, receiver_id: job.requester_id, content: CHAT_TEXT,
    })
    if (error) return log(job.id, 'chat_err', `⚠️  Could not message you on "${job.title}": ${error.message}`)
    return log(job.id, 'chatted', `🗨️  Offer accepted! Messaged you about "${job.title}".  → Reply in the chat.`)
  }

  // Wait for your reply, then complete after a delay
  const { data: reply } = await supabase
    .from('messages').select('id').eq('job_id', job.id).eq('sender_id', job.requester_id)
    .gt('created_at', mine[0].created_at).limit(1)
  if (!reply || reply.length === 0) return log(job.id, 'wait_chat', `⏳ Waiting for your chat reply on "${job.title}"…`)

  if (!readyAt.has(job.id)) readyAt.set(job.id, Date.now() + COMPLETE_DELAY_MS)
  if (Date.now() < readyAt.get(job.id)) {
    const secs = Math.ceil((readyAt.get(job.id) - Date.now()) / 1000)
    return log(job.id, 'wrapping', `⏳ Wrapping up "${job.title}" — will mark complete in ~${secs}s.`)
  }
  const { error } = await supabase.from('jobs').update({ status: 'awaiting_completion' }).eq('id', job.id)
  if (error) return log(job.id, 'complete_err', `⚠️  Could not complete "${job.title}": ${error.message}`)
  return log(job.id, 'done', `✅ Completed "${job.title}".  → Confirm it in the app to finalise.`)
}

async function tick() {
  if (busy) return
  busy = true
  try {
    // Open jobs in the watched categories (not posted by me)
    const { data: openJobs } = await supabase
      .from('jobs').select('*')
      .eq('status', 'open').eq('visibility', 'public')
      .in('category', WATCH_CATEGORIES)
    for (const job of openJobs || []) {
      if (job.requester_id !== me) await handleOpenJob(job)
    }

    // Jobs where my offer was accepted (drive chat → complete)
    const { data: accepted } = await supabase
      .from('bids').select('job_id').eq('provider_id', me).eq('status', 'accepted')
    const ids = [...new Set((accepted || []).map(b => b.job_id))]
    if (ids.length) {
      const { data: engaged } = await supabase.from('jobs').select('*').in('id', ids)
      for (const job of engaged || []) await handleEngagedJob(job)
    }
  } catch (e) {
    console.error('tick error:', e.message)
  } finally {
    busy = false
  }
}

// One-shot: post the sample jobs (skips any already posted by this account, so
// it's safe to re-run). Posts as the bot account, so view the board from a
// different account to see them.
async function seedJobs() {
  const { data: existing } = await supabase
    .from('jobs').select('title').eq('requester_id', me).in('title', SAMPLE_JOBS.map(j => j.title))
  const have = new Set((existing || []).map(j => j.title))
  const toInsert = SAMPLE_JOBS
    .filter(j => !have.has(j.title))
    // Set every column on every row — PostgREST bulk insert uses NULL (not the
    // DB default) for keys missing on some rows.
    .map(j => ({
      requester_id: me, status: 'open', visibility: 'public',
      schedule_type: 'flexible', materials_type: 'none',
      hide_exact_location: j.hide_exact_location || false,
      price: j.price ?? null,
      title: j.title, description: j.description, category: j.category,
      price_type: j.price_type, location_name: j.location_name,
      location_area: j.location_area, latitude: j.latitude, longitude: j.longitude,
    }))

  if (toInsert.length === 0) {
    console.log('\n🌱 All sample jobs already exist — nothing to seed.\n')
    return
  }
  const { data, error } = await supabase.from('jobs').insert(toInsert).select('id, title, category')
  if (error) {
    console.error(`\n❌ Seed failed: ${error.message}\n`)
    process.exit(1)
  }
  console.log(`\n🌱 Seeded ${data.length} sample job${data.length === 1 ? '' : 's'} as ${PROVIDER.email}:`)
  data.forEach(j => console.log(`   • ${j.title}  (${j.category})`))
  console.log('\n   View the Jobs board from any OTHER account to see them. To remove them later,')
  console.log('   delete these jobs in the app or via the dashboard.\n')
}

async function main() {
  const seedMode = process.argv.slice(2).some(a => a === '--seed' || a === 'seed')

  const { data: session, error } = await supabase.auth.signInWithPassword(PROVIDER)
  if (error) {
    console.error(`\n❌ Login failed for ${PROVIDER.email}: ${error.message}`)
    console.error('   Create the provider test account first (see tests/e2e-job-flow.js).\n')
    process.exit(1)
  }
  me = session.user.id

  if (seedMode) {
    await seedJobs()
    process.exit(0)
  }

  console.log('\n🤖 Provider bot online')
  console.log(`   as: ${PROVIDER.email}`)
  console.log(`   watching: ${WATCH_CATEGORIES.join(', ')}`)
  console.log(`   polling every ${POLL_MS / 1000}s · completes ${COMPLETE_DELAY_MS / 1000}s after your chat reply`)
  console.log('\n   Post a job in one of those categories to see it in action. Ctrl+C to stop.\n')

  await tick()
  setInterval(tick, POLL_MS)
}

main().catch(e => { console.error(e); process.exit(1) })
