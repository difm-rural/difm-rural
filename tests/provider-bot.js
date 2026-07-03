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
// JOB_CATEGORIES exactly). Add/remove to taste.
const WATCH_CATEGORIES = [
  'Fencing', 'Animal Care', 'Machinery', 'Labour', 'General Labour', 'Spraying', 'Water',
]

const POLL_MS            = 6000    // how often to check for new jobs / replies
const COMPLETE_DELAY_MS  = 45000   // wait after your chat reply before marking done
const DEFAULT_BID        = 150     // used when the job has no fixed price

const QUESTION_TEXT = 'Kia ora — keen to help with this. Is there vehicle access to the site, and is the timing flexible?'
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

async function main() {
  const { data: session, error } = await supabase.auth.signInWithPassword(PROVIDER)
  if (error) {
    console.error(`\n❌ Login failed for ${PROVIDER.email}: ${error.message}`)
    console.error('   Create the provider test account first (see tests/e2e-job-flow.js).\n')
    process.exit(1)
  }
  me = session.user.id

  console.log('\n🤖 Provider bot online')
  console.log(`   as: ${PROVIDER.email}`)
  console.log(`   watching: ${WATCH_CATEGORIES.join(', ')}`)
  console.log(`   polling every ${POLL_MS / 1000}s · completes ${COMPLETE_DELAY_MS / 1000}s after your chat reply`)
  console.log('\n   Post a job in one of those categories to see it in action. Ctrl+C to stop.\n')

  await tick()
  setInterval(tick, POLL_MS)
}

main().catch(e => { console.error(e); process.exit(1) })
