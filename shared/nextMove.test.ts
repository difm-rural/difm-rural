// Run with: npm test   (whole suite), or on its own:
//   node --import ./tests/support/ts-resolve.mjs shared/nextMove.test.ts
import assert from 'node:assert/strict'
import { jobNextMove } from './nextMove.ts'

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

console.log(`\n✅ jobNextMove flexible payment: all ${passed} cases passed`)
