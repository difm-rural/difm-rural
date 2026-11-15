// Run with: npm test   (whole suite), or on its own:
//   node --import ./tests/support/ts-resolve.mjs shared/nextMove.test.ts
import assert from 'node:assert/strict'
import { bookingNextMove, jobNextMove, nextMoveHeading } from './nextMove.ts'

let passed = 0
function check(name: string, got: unknown, expected: unknown) {
  assert.deepEqual(got, expected, `${name}\n  got:      ${JSON.stringify(got)}\n  expected: ${JSON.stringify(expected)}`)
  passed++
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const future = iso(new Date(Date.now() + 7 * 86400000))
const past = iso(new Date(Date.now() - 7 * 86400000))
const futureWeekday = new Date(future + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'long' })

// helper: pick just the fields we assert on
const pick = (m: ReturnType<typeof jobNextMove>) => m && { label: m.label, detail: m.detail, needsAction: m.needsAction, tone: m.tone, actionLabel: m.actionLabel }

// ---- Provider, accepted/in_progress ----
check('provider · not confirmed → confirm job',
  pick(jobNextMove({ status: 'accepted' }, 'provider', {})),
  { label: 'Waiting on you', detail: 'Confirm the job — arrival time and how to get paid', needsAction: true, tone: 'attention', actionLabel: 'Confirm job' })

check('provider · arrival set but no method → still confirm',
  pick(jobNextMove({ status: 'accepted' }, 'provider', { hasArrival: true, paymentMethod: null })),
  { label: 'Waiting on you', detail: 'Confirm the job — arrival time and how to get paid', needsAction: true, tone: 'attention', actionLabel: 'Confirm job' })

check('provider · method set but no arrival → still confirm',
  pick(jobNextMove({ status: 'accepted' }, 'provider', { hasArrival: false, paymentMethod: 'cash' })),
  { label: 'Waiting on you', detail: 'Confirm the job — arrival time and how to get paid', needsAction: true, tone: 'attention', actionLabel: 'Confirm job' })

check('provider · method set, no schedule → complete the work',
  pick(jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash' })),
  { label: 'Waiting on you', detail: 'Complete the work, then mark it complete', needsAction: false, tone: 'active', actionLabel: 'View job' })

check('provider · method set, future schedule wins',
  pick(jobNextMove({ status: 'accepted', scheduled_date: future }, 'provider', { paymentMethod: 'bank_transfer' })),
  { label: `Scheduled for ${futureWeekday}`, detail: 'You are booked for this job', needsAction: false, tone: 'scheduled', actionLabel: null })

check('provider · payment sorted → mark complete',
  pick(jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash', paymentSortedAt: '2026-11-09T00:00:00Z' })),
  { label: 'Waiting on you', detail: "Payment's sorted — mark the job complete when you're done", needsAction: true, tone: 'active', actionLabel: 'View job' })

check('provider · payment sorted beats a future schedule',
  pick(jobNextMove({ status: 'accepted', scheduled_date: future }, 'provider', { paymentMethod: 'bank_transfer', paymentSortedAt: '2026-11-09T00:00:00Z' })),
  { label: 'Waiting on you', detail: "Payment's sorted — mark the job complete when you're done", needsAction: true, tone: 'active', actionLabel: 'View job' })

check('provider · in_progress, not confirmed → confirm job',
  pick(jobNextMove({ status: 'in_progress' }, 'provider', {})),
  { label: 'Waiting on you', detail: 'Confirm the job — arrival time and how to get paid', needsAction: true, tone: 'attention', actionLabel: 'Confirm job' })

// ---- Requester, accepted/in_progress ----
check('requester · not confirmed → they will confirm',
  pick(jobNextMove({ status: 'accepted' }, 'requester', {})),
  { label: 'Waiting on the provider', detail: "They'll confirm the arrival time and how to pay", needsAction: false, tone: 'waiting', actionLabel: null })

check('requester · method set but no arrival → waiting to confirm',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { hasArrival: false, paymentMethod: 'cash' })),
  { label: 'Waiting on the provider', detail: "They'll confirm the arrival time and how to pay", needsAction: false, tone: 'waiting', actionLabel: null })

const calm = (label: string, detail: string) => ({ label, detail, needsAction: false, tone: 'scheduled', actionLabel: null })

check('requester · bank, not sorted, past schedule → pay as agreed, never needsAction',
  pick(jobNextMove({ status: 'accepted', scheduled_date: past }, 'requester', { paymentMethod: 'bank_transfer' })),
  calm('Job confirmed', 'Pay as agreed'))

check('requester · invoice → pay as agreed',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'invoice' })),
  calm('Job confirmed', 'Pay as agreed'))

check('requester · agreed → pay as agreed',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'agreed' })),
  calm('Job confirmed', 'Pay as agreed'))

check('requester · cash → pay on the day',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash' })),
  calm('Job confirmed', 'Pay on the day'))

check('requester · not sorted, future schedule → schedule label',
  pick(jobNextMove({ status: 'accepted', scheduled_date: future }, 'requester', { paymentMethod: 'bank_transfer' })),
  calm(`Scheduled for ${futureWeekday}`, 'Pay as agreed'))

check('requester · payment sorted → waiting on provider',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash', paymentSortedAt: '2026-11-09T00:00:00Z' })),
  { label: 'Waiting on the provider', detail: "They'll mark the job complete", needsAction: false, tone: 'waiting', actionLabel: null })

check('requester · payment sorted uses the provider first name',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'invoice', paymentSortedAt: '2026-11-09T00:00:00Z', otherName: 'Sam Rata' })),
  { label: 'Waiting on Sam', detail: "They'll mark the job complete", needsAction: false, tone: 'waiting', actionLabel: null })

// ---- Regression: untouched branches ----
check('open · requester with offers',
  pick(jobNextMove({ status: 'open' }, 'requester', { bidCount: 2 })),
  { label: 'Waiting on you', detail: 'Review and choose from 2 offers', needsAction: true, tone: 'attention', actionLabel: 'Review offers' })

check('open · provider pending bid',
  pick(jobNextMove({ status: 'open' }, 'provider', { hasPendingBid: true })),
  { label: 'Waiting on the requester', detail: 'Your offer is being considered', needsAction: false, tone: 'waiting', actionLabel: null })

check('completed → null', jobNextMove({ status: 'completed' }, 'provider', {}), null)

// ---- Badge: whose turn + what's next (every branch) ----
const badge = (m: ReturnType<typeof jobNextMove>) => m && [m.badge, m.badgeTone]
const sorted = '2026-11-09T00:00:00Z'

// Jobs · open
check('badge · open · requester with a question', badge(jobNextMove({ status: 'open' }, 'requester', { unansweredQuestionCount: 1, bidCount: 2 })), ['Waiting on you to answer', 'attention'])
check('badge · open · requester with offers', badge(jobNextMove({ status: 'open' }, 'requester', { bidCount: 2 })), ['Waiting on you to choose', 'attention'])
check('badge · open · provider with a pending offer', badge(jobNextMove({ status: 'open' }, 'provider', { hasPendingBid: true, otherName: 'Sam Rata' })), ['Waiting on Sam to choose', 'muted'])
check('badge · open · no offers yet', badge(jobNextMove({ status: 'open' }, 'requester', {})), ['Waiting for offers', 'muted'])

// Jobs · accepted, not yet confirmed
check('badge · provider must confirm', badge(jobNextMove({ status: 'accepted' }, 'provider', {})), ['Waiting on you to confirm', 'attention'])
check('badge · requester waits for confirmation', badge(jobNextMove({ status: 'accepted' }, 'requester', { otherName: 'Sam Rata' })), ['Waiting on Sam to confirm', 'muted'])
check('badge · requester, no name → role word', badge(jobNextMove({ status: 'accepted' }, 'requester', {})), ['Waiting on the provider to confirm', 'muted'])

// Jobs · confirmed
check('badge · provider, payment sorted', badge(jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash', paymentSortedAt: sorted })), ['Waiting on you to complete', 'attention'])
check('badge · provider, scheduled ahead', badge(jobNextMove({ status: 'accepted', scheduled_date: future }, 'provider', { paymentMethod: 'cash' })), ['Waiting on you to complete', 'muted'])
check('badge · provider, doing the work', badge(jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash' })), ['Waiting on you to complete', 'muted'])
check('badge · requester, payment sorted', badge(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash', paymentSortedAt: sorted, otherName: 'Sam' })), ['Waiting on Sam to complete', 'muted'])
check('badge · requester, not sorted', badge(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'invoice', otherName: 'Sam' })), ['Waiting on Sam to complete', 'muted'])
check('badge · requester, not sorted, scheduled ahead', badge(jobNextMove({ status: 'accepted', scheduled_date: future }, 'requester', { paymentMethod: 'invoice', otherName: 'Sam' })), ['Waiting on Sam to complete', 'muted'])

// Jobs · terminal states have no next move → cards keep the status word
for (const status of ['completed', 'cancelled']) {
  check(`badge · job ${status} → none`, jobNextMove({ status }, 'provider', {}), null)
  check(`badge · job ${status} (requester) → none`, jobNextMove({ status }, 'requester', {}), null)
}

// Bookings
const quote = { service: { pricing_type: 'quote_required' } }
const fixed = { service: { pricing_type: 'fixed' } }
const bk = (booking: object, role: string, name?: string) => badge(bookingNextMove(booking, role, { otherName: name }))
check('badge · booking request · provider', bk({ status: 'pending', ...fixed }, 'provider'), ['Waiting on you to respond', 'attention'])
check('badge · quote request · provider', bk({ status: 'pending', ...quote }, 'provider'), ['Waiting on you to respond', 'attention'])
check('badge · booking request · requester', bk({ status: 'pending', ...fixed }, 'requester', 'Sam Rata'), ['Waiting on Sam to respond', 'muted'])
check('badge · quote sent · requester', bk({ status: 'quote_sent', ...quote }, 'requester'), ['Waiting on you to respond', 'attention'])
check('badge · quote sent · provider', bk({ status: 'quote_sent', ...quote }, 'provider', 'Ana'), ['Waiting on Ana to respond', 'muted'])
for (const status of ['confirmed', 'in_progress']) {
  check(`badge · ${status} · provider`, bk({ status, ...fixed }, 'provider'), ['Waiting on you to complete', 'muted'])
  check(`badge · ${status} · requester`, bk({ status, ...fixed }, 'requester', 'Sam'), ['Waiting on Sam to complete', 'muted'])
  check(`badge · ${status} · provider, scheduled ahead`, bk({ status, scheduled_date: future, ...fixed }, 'provider'), ['Waiting on you to complete', 'muted'])
  check(`badge · ${status} · requester, scheduled ahead`, bk({ status, scheduled_date: future, ...fixed }, 'requester', 'Sam'), ['Waiting on Sam to complete', 'muted'])
  check(`badge · ${status} · grazing`, bk({ status, service: { kind: 'grazing' } }, 'provider'), ['Arrangement accepted', 'muted'])
}
check('badge · cancellation requested · provider', bk({ status: 'cancellation_requested', ...fixed }, 'provider'), ['Waiting on you to respond', 'attention'])
check('badge · cancellation requested · requester', bk({ status: 'cancellation_requested', ...fixed }, 'requester', 'Sam'), ['Waiting on Sam to respond', 'muted'])
for (const status of ['completed', 'cancelled', 'declined', 'withdrawn']) {
  check(`badge · booking ${status} → none`, bookingNextMove({ status, ...fixed }, 'provider'), null)
}

// The attention tone always goes with needsAction, and nothing else.
for (const m of [
  jobNextMove({ status: 'open' }, 'requester', { bidCount: 1 }),
  jobNextMove({ status: 'accepted' }, 'provider', {}),
  jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash' }),
  jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash' }),
  bookingNextMove({ status: 'pending', ...fixed }, 'provider'),
  bookingNextMove({ status: 'confirmed', ...fixed }, 'requester'),
]) check(`badge tone follows needsAction · ${m!.badge}`, m!.badgeTone, m!.needsAction ? 'attention' : 'muted')

// ---- Next-move box heading under a badge ----
check('heading · "Waiting on you" repeats the badge → dropped', nextMoveHeading(jobNextMove({ status: 'accepted' }, 'provider', {})), null)
check('heading · "Waiting on Sam" repeats the badge → dropped', nextMoveHeading(jobNextMove({ status: 'accepted' }, 'requester', { otherName: 'Sam' })), null)
check('heading · schedule line is kept', nextMoveHeading(jobNextMove({ status: 'accepted', scheduled_date: future }, 'provider', { paymentMethod: 'cash' })), `Scheduled for ${futureWeekday}`)
check('heading · "Job confirmed" is kept', nextMoveHeading(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash' })), 'Job confirmed')
check('heading · "No response yet" is kept', nextMoveHeading(jobNextMove({ status: 'open' }, 'requester', {})), 'No response yet')
check('heading · no move', nextMoveHeading(null), null)

console.log(`\n✅ nextMove: all ${passed} cases passed`)
