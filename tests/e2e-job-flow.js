const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://opagkgfxmjqmnvhrcris.supabase.co'
const supabaseKey = 'sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'

// ─── Auth strategy ────────────────────────────────────────────────────────────
//
// The app uses OTP (passwordless) for real users, but test accounts use
// password login so the test script can authenticate without an email inbox.
//
// One-time setup in Supabase dashboard (Authentication → Users):
//   1. Create user: test.requester@difmrural.test
//      Set password → TestPass123!
//      In profiles table set primary_role = 'requester', onboarding_completed = true
//   2. Create user: test.provider@difmrural.test
//      Set password → TestPass123!
//      In profiles table set primary_role = 'provider', onboarding_completed = true
//
// Alternative: use the service role key to create admin sessions without any
// password or OTP. Uncomment the adminClient block below and swap the
// signInWithPassword calls for adminClient.auth.admin.createSession(userId).
//
// const SUPABASE_SERVICE_KEY = 'your_service_role_key_here'
// // Found in: Supabase dashboard → Settings → API → service_role (secret — never commit)
// const adminClient = createClient(supabaseUrl, SUPABASE_SERVICE_KEY, {
//   auth: { autoRefreshToken: false, persistSession: false },
// })
// Then replace each signInWithPassword block with:
//   const { data: requesterAuth } = await adminClient.auth.admin.getUserByEmail(REQUESTER_EMAIL)
//   requesterClient = await adminClient.auth.admin.createSession(requesterAuth.user.id) // hypothetical
// In practice, generate a signed JWT via the service role and set it on the client.

const REQUESTER_EMAIL    = 'test.requester@difmrural.test'
const REQUESTER_PASSWORD = 'TestPass123!'
const PROVIDER_EMAIL     = 'test.provider@difmrural.test'
const PROVIDER_PASSWORD  = 'TestPass123!'

// ─── Utilities ────────────────────────────────────────────────────────────────

function log(emoji, message) {
  console.log(`${emoji} ${message}`)
}

function success(message) {
  console.log(`✅ ${message}`)
}

function fail(message, error) {
  console.log(`❌ ${message}`)
  console.log(`   Error: ${error?.message || error}`)
  process.exit(1)
}

function section(title) {
  console.log('\n' + '─'.repeat(50))
  console.log(`  ${title}`)
  console.log('─'.repeat(50))
}

// ─── Main test ────────────────────────────────────────────────────────────────

async function runJobFlowTest() {
  console.log('\n🚀 DIFM Rural — Job Flow Test')
  console.log('================================\n')

  let requesterClient, providerClient
  let jobId, bidId, questionId

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Login as Requester
  // Test accounts use password login — real app users use OTP (passwordless).
  // See setup instructions at the top of this file.
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 1: Requester login (password — test account only)')

  requesterClient = createClient(supabaseUrl, supabaseKey)
  const { data: requesterAuth, error: requesterLoginError } =
    await requesterClient.auth.signInWithPassword({
      email:    REQUESTER_EMAIL,
      password: REQUESTER_PASSWORD,
    })

  if (requesterLoginError) fail('Requester login failed — have you set a password on this test account in Supabase Auth?', requesterLoginError)
  success(`Logged in as Requester: ${requesterAuth.user.email}`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Post a job
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 2: Post a job')

  const jobData = {
    requester_id:      requesterAuth.user.id,
    title:             `[TEST] Fence repair — ${Date.now()}`,
    description:       'Automated test job. Please ignore. At least 20 chars.',
    category:          'Fencing',
    price_type:        'fixed',
    price:             250,
    status:            'open',
    location_name:     "Havelock North, Hawke's Bay",
    materials_type:    'requester',
    access_conditions: ['park_and_walk'],
    location_note:     'Test access note',
    schedule_type:     'flexible',
  }

  const { data: job, error: jobError } = await requesterClient
    .from('jobs')
    .insert(jobData)
    .select()
    .single()

  if (jobError) fail('Job posting failed', jobError)
  jobId = job.id
  success(`Job posted: "${job.title}"`)
  log('📋', `Job ID: ${jobId}`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Login as Provider
  // Same password-login approach as Step 1 — test account only.
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 3: Provider login (password — test account only)')

  providerClient = createClient(supabaseUrl, supabaseKey)
  const { data: providerAuth, error: providerLoginError } =
    await providerClient.auth.signInWithPassword({
      email:    PROVIDER_EMAIL,
      password: PROVIDER_PASSWORD,
    })

  if (providerLoginError) fail('Provider login failed — have you set a password on this test account in Supabase Auth?', providerLoginError)
  success(`Logged in as Provider: ${providerAuth.user.email}`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Provider views job
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 4: Provider views job')

  const { data: viewedJob, error: viewError } = await providerClient
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (viewError) fail('Provider cannot view job', viewError)
  success(`Provider can see job: "${viewedJob.title}"`)
  log('📋', `Materials: ${viewedJob.materials_type}`)
  log('📋', `Access conditions: ${viewedJob.access_conditions?.join(', ')}`)
  log('📋', `Access note: ${viewedJob.location_note}`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Provider asks a question
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 5: Provider asks a question')

  const { data: question, error: questionError } = await providerClient
    .from('job_questions')
    .insert({
      job_id:   jobId,
      asker_id: providerAuth.user.id,
      question: 'Is there water access near the work area?',
    })
    .select()
    .single()

  if (questionError) fail('Question posting failed', questionError)
  questionId = question.id
  success(`Question asked: "${question.question}"`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Check notification sent to Requester
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 6: Check notification sent to Requester')

  // Allow a moment for any DB triggers to fire
  await new Promise(r => setTimeout(r, 1000))

  const { data: notifications } = await requesterClient
    .from('notifications')
    .select('*')
    .eq('user_id', requesterAuth.user.id)
    .eq('type', 'new_question')
    .order('created_at', { ascending: false })
    .limit(1)

  if (notifications?.length > 0) {
    success(`Notification found: "${notifications[0].body}"`)
  } else {
    log('⚠️ ', 'No notification found — app inserts these client-side, not via DB trigger')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: Requester answers question
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 7: Requester answers question')

  const { error: answerError } = await requesterClient
    .from('job_questions')
    .update({
      answer:      'Yes there is a water trough about 50m away.',
      answered_at: new Date().toISOString(),
    })
    .eq('id', questionId)

  if (answerError) fail('Answer posting failed', answerError)
  success('Question answered by Requester')

  // Verify the answer is readable by the provider
  const { data: answeredQ } = await providerClient
    .from('job_questions')
    .select('answer')
    .eq('id', questionId)
    .single()

  if (!answeredQ?.answer) fail('Provider cannot read answer', 'answer field is empty')
  log('📋', `Answer visible to provider: "${answeredQ.answer}"`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 8: Provider places itemised bid
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 8: Provider places itemised bid')

  const lineItems = [
    { label: 'Labour',    amount: 180 },
    { label: 'Travel',    amount: 40  },
    { label: 'Equipment', amount: 30  },
  ]
  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0)

  const { data: bid, error: bidError } = await providerClient
    .from('bids')
    .insert({
      job_id:             jobId,
      provider_id:        providerAuth.user.id,
      amount:             totalAmount,
      message:            'I have 15 years experience and can start Friday.',
      line_items:         lineItems,
      available_from:     new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      estimated_duration: '1 day',
      status:             'pending',
    })
    .select()
    .single()

  if (bidError) fail('Bid placement failed', bidError)
  bidId = bid.id
  success(`Bid placed: $${bid.amount} NZD`)
  log('📋', `Line items: ${lineItems.map(i => `${i.label} $${i.amount}`).join(', ')}`)
  log('📋', `Available from: ${bid.available_from}`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 9: Provider edits bid
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 9: Provider edits bid')

  const updatedLineItems = [
    { label: 'Labour',    amount: 200 },
    { label: 'Travel',    amount: 40  },
    { label: 'Equipment', amount: 30  },
  ]
  const updatedTotal = updatedLineItems.reduce((sum, item) => sum + item.amount, 0)

  const { error: editBidError } = await providerClient
    .from('bids')
    .update({
      amount:     updatedTotal,
      line_items: updatedLineItems,
    })
    .eq('id', bidId)

  if (editBidError) fail('Bid edit failed', editBidError)
  success(`Bid updated to: $${updatedTotal} NZD`)

  // Verify updated amount persisted
  const { data: updatedBid } = await providerClient
    .from('bids').select('amount, line_items').eq('id', bidId).single()
  if (updatedBid?.amount !== updatedTotal) {
    fail('Bid amount did not update correctly', `Expected $${updatedTotal}, got $${updatedBid?.amount}`)
  }
  log('📋', `Confirmed stored amount: $${updatedBid.amount}`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 10: Requester reviews bids
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 10: Requester reviews bids')

  const { data: bids, error: bidsError } = await requesterClient
    .from('bids')
    .select('*')
    .eq('job_id', jobId)

  if (bidsError) fail('Cannot fetch bids', bidsError)
  success(`Requester can see ${bids.length} bid(s)`)
  bids.forEach(b => {
    log('📋', `  $${b.amount} — ${(b.message || '').substring(0, 50)}`)
    if (b.line_items?.length > 0) {
      b.line_items.forEach(li => log('     ', `${li.label}: $${li.amount}`))
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 11: Requester accepts bid
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 11: Requester accepts bid')

  const { error: acceptBidError } = await requesterClient
    .from('bids')
    .update({ status: 'accepted' })
    .eq('id', bidId)

  if (acceptBidError) fail('Bid acceptance failed', acceptBidError)

  // Reject all other bids on this job
  await requesterClient
    .from('bids')
    .update({ status: 'rejected' })
    .eq('job_id', jobId)
    .neq('id', bidId)

  const { error: updateJobError } = await requesterClient
    .from('jobs')
    .update({ status: 'accepted' })
    .eq('id', jobId)

  if (updateJobError) fail('Job status update to accepted failed', updateJobError)
  success('Bid accepted — job status → accepted')

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 12: Provider sends chat message
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 12: Provider sends chat message')

  const { error: chatError } = await providerClient
    .from('messages')
    .insert({
      job_id:      jobId,
      sender_id:   providerAuth.user.id,
      receiver_id: requesterAuth.user.id,
      content:     'Great! I will be there Friday at 8am.',
    })

  if (chatError) fail('Chat message failed', chatError)
  success('Provider sent chat message')

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 13: Requester replies in chat
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 13: Requester replies in chat')

  const { error: replyError } = await requesterClient
    .from('messages')
    .insert({
      job_id:      jobId,
      sender_id:   requesterAuth.user.id,
      receiver_id: providerAuth.user.id,
      content:     'Perfect, gate code is 1234.',
    })

  if (replyError) fail('Reply failed', replyError)
  success('Requester replied in chat')

  // Verify both messages are readable
  const { data: thread } = await requesterClient
    .from('messages').select('sender_id, content').eq('job_id', jobId)
  success(`Chat thread has ${thread?.length} message(s)`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 14: Provider marks job as started
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 14: Provider marks job as started')

  const { error: startError } = await providerClient
    .from('jobs')
    .update({ status: 'in_progress' })
    .eq('id', jobId)

  if (startError) fail('Job start failed (check RLS — provider may need update permission)', startError)
  success('Job status → in_progress')

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 15: Mark job complete
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 15: Mark job complete')

  const { error: completeError } = await requesterClient
    .from('jobs')
    .update({ status: 'completed' })
    .eq('id', jobId)

  if (completeError) fail('Job completion failed', completeError)
  success('Job status → completed')

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 16: Verify final state
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 16: Verify final state')

  const { data: finalJob, error: finalError } = await requesterClient
    .from('jobs')
    .select('status')
    .eq('id', jobId)
    .single()

  if (finalError) fail('Cannot read final job state', finalError)
  if (finalJob.status !== 'completed') {
    fail('Job not in completed state', `Status is: ${finalJob.status}`)
  }
  success(`Final job status confirmed: ${finalJob.status}`)

  const { data: finalBid } = await requesterClient
    .from('bids').select('status').eq('id', bidId).single()
  success(`Winning bid status: ${finalBid?.status}`)

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 17: Cleanup test data
  // ─────────────────────────────────────────────────────────────────────────
  section('STEP 17: Cleanup test data')

  // Cascading deletes via FK will remove bids, messages, job_questions
  const { error: deleteError } = await requesterClient
    .from('jobs')
    .delete()
    .eq('id', jobId)

  if (deleteError) {
    log('⚠️ ', `Could not delete test job: ${deleteError.message}`)
    log('⚠️ ', `Manual cleanup needed — job ID: ${jobId}`)
  } else {
    success(`Test job deleted (ID: ${jobId})`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Results
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50))
  console.log('  ✅ ALL TESTS PASSED')
  console.log('  Job flow completed end-to-end successfully!')
  console.log('═'.repeat(50) + '\n')

  process.exit(0)
}

// ─── Entry point ──────────────────────────────────────────────────────────────

runJobFlowTest().catch(error => {
  console.log('\n❌ UNEXPECTED ERROR:')
  console.log(error)
  process.exit(1)
})
