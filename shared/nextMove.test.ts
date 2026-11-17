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
const futureWeekday = new Date(future + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'long' })

// helper: pick just the fields we assert on
const pick = (m: ReturnType<typeof jobNextMove>) => m && { label: m.label, detail: m.detail, needsAction: m.needsAction, tone: m.tone, actionLabel: m.actionLabel }

// Confirmation and the next work action stay independent of payment.
const paid = '2026-11-09T00:00:00Z'
for (const viewer of ['requester', 'provider']) {
  for (const status of ['accepted', 'in_progress']) {
    for (const hasArrival of [true, false]) {
      const job = { status, scheduled_date: future }
      check(`${viewer} · ${status} · payment does not change work status (${hasArrival})`,
        jobNextMove(job, viewer, { hasArrival, paymentSortedAt: paid }),
        jobNextMove(job, viewer, { hasArrival, paymentSortedAt: null }))
    }
  }
}
check('provider · no arrival → confirm',
  pick(jobNextMove({ status: 'accepted' }, 'provider', { hasArrival: false, paymentMethod: 'cash' })),
  { label: 'Waiting on you', detail: 'Confirm your arrival time', needsAction: true, tone: 'attention', actionLabel: 'Confirm job' })
check('provider · arrival exists without payment method → complete work',
  pick(jobNextMove({ status: 'accepted' }, 'provider', { hasArrival: true })),
  { label: 'Waiting on you', detail: 'Complete the work, then mark it complete', needsAction: false, tone: 'active', actionLabel: 'View job' })
check('requester · confirmed work, future arrival stays scheduled',
  pick(jobNextMove({ status: 'accepted', scheduled_date: future }, 'requester', { hasArrival: true, paymentSortedAt: paid })),
  { label: `Scheduled for ${futureWeekday}`, detail: "They'll mark the job complete", needsAction: false, tone: 'scheduled', actionLabel: null })

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
check('badge · provider, payment sorted', badge(jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash', paymentSortedAt: sorted })), ['Waiting on you to complete', 'muted'])
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

// ---- Short badge for narrow cards: "Your turn" / "Sam's turn" ----
const short = (m: ReturnType<typeof jobNextMove>) => m && m.badgeShort
check('short · needs action → Your turn', short(jobNextMove({ status: 'accepted' }, 'provider', {})), 'Your turn')
check('short · requester must choose → Your turn', short(jobNextMove({ status: 'open' }, 'requester', { bidCount: 2 })), 'Your turn')
check('short · requester must answer → Your turn', short(jobNextMove({ status: 'open' }, 'requester', { unansweredQuestionCount: 1 })), 'Your turn')
check('short · your move even when not urgent (doing the work) → Your turn', short(jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash' })), 'Your turn')
check('short · your move, scheduled ahead → Your turn', short(jobNextMove({ status: 'accepted', scheduled_date: future }, 'provider', { paymentMethod: 'cash' })), 'Your turn')
check('short · other party, first name only', short(jobNextMove({ status: 'accepted' }, 'requester', { otherName: 'Sam Rata' })), "Sam's turn")
check('short · other party to complete', short(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash', otherName: 'Christopher Longname' })), "Christopher's turn")
check('short · provider waiting on the requester to choose', short(jobNextMove({ status: 'open' }, 'provider', { hasPendingBid: true, otherName: 'Ana' })), "Ana's turn")
check('short · no name, requester view → Provider', short(jobNextMove({ status: 'accepted' }, 'requester', {})), "Provider's turn")
check('short · no name, provider view → Requester', short(jobNextMove({ status: 'open' }, 'provider', { hasPendingBid: true })), "Requester's turn")
check('short · Waiting for offers is unchanged', short(jobNextMove({ status: 'open' }, 'requester', {})), 'Waiting for offers')
check('short · booking request · provider', short(bookingNextMove({ status: 'pending', ...fixed }, 'provider')), 'Your turn')
check('short · booking request · requester', short(bookingNextMove({ status: 'pending', ...fixed }, 'requester', { otherName: 'Sam Rata' })), "Sam's turn")
check('short · quote sent · requester', short(bookingNextMove({ status: 'quote_sent', ...quote }, 'requester')), 'Your turn')
check('short · confirmed booking · provider', short(bookingNextMove({ status: 'confirmed', ...fixed }, 'provider')), 'Your turn')
check('short · confirmed booking · requester', short(bookingNextMove({ status: 'confirmed', ...fixed }, 'requester', { otherName: 'Sam' })), "Sam's turn")
check('short · cancellation · requester', short(bookingNextMove({ status: 'cancellation_requested', ...fixed }, 'requester', { otherName: 'Sam' })), "Sam's turn")
check('short · grazing arrangement is unchanged', short(bookingNextMove({ status: 'confirmed', service: { kind: 'grazing' } }, 'provider')), 'Arrangement accepted')
check('short · the full badge is still there for wide headers', jobNextMove({ status: 'accepted' }, 'requester', { otherName: 'Sam Rata' })!.badge, 'Waiting on Sam to confirm')
// Whenever the viewer must act, the short badge is "Your turn".
for (const m of [
  jobNextMove({ status: 'open' }, 'requester', { bidCount: 1 }),
  jobNextMove({ status: 'accepted' }, 'provider', {}),
  bookingNextMove({ status: 'pending', ...quote }, 'provider'),
  bookingNextMove({ status: 'cancellation_requested', ...fixed }, 'provider'),
]) check(`short · needsAction is always Your turn · ${m!.badge}`, [m!.needsAction, m!.badgeShort], [true, 'Your turn'])

// ---- Next-move box heading under a badge ----
check('heading · "Waiting on you" repeats the badge → dropped', nextMoveHeading(jobNextMove({ status: 'accepted' }, 'provider', {})), null)
check('heading · "Waiting on Sam" repeats the badge → dropped', nextMoveHeading(jobNextMove({ status: 'accepted' }, 'requester', { otherName: 'Sam' })), null)
check('heading · schedule line is kept', nextMoveHeading(jobNextMove({ status: 'accepted', scheduled_date: future }, 'provider', { paymentMethod: 'cash' })), `Scheduled for ${futureWeekday}`)
check('confirmed timestamp uses the Auckland weekday even when it is still the previous UTC day',
  jobNextMove({ status: 'accepted' }, 'provider', { hasArrival: true, arrivalAt: '2099-11-18T21:00:00Z' })?.label,
  new Date('2099-11-19T00:00:00Z').toLocaleDateString('en-NZ', { weekday: 'long', timeZone: 'UTC' }).replace(/^/, 'Scheduled for '))
check('heading · "Job confirmed" is kept', nextMoveHeading(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash' })), 'Job confirmed')
check('heading · "No response yet" is kept', nextMoveHeading(jobNextMove({ status: 'open' }, 'requester', {})), 'No response yet')
check('heading · no move', nextMoveHeading(null), null)

console.log(`\n✅ nextMove: all ${passed} cases passed`)
