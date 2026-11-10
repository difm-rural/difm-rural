// Run with the TS resolve harness (see scratchpad ts-register.mjs):
//   node --import <scratch>/ts-register.mjs shared/nextMove.test.ts
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
check('provider · no method',
  pick(jobNextMove({ status: 'accepted' }, 'provider', {})),
  { label: 'Waiting on you', detail: "Confirm timing and how you'd like to be paid", needsAction: true, tone: 'attention', actionLabel: 'Next steps' })

check('provider · method set, no schedule → complete the work',
  pick(jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash' })),
  { label: 'Waiting on you', detail: 'Complete the work, then mark it complete', needsAction: false, tone: 'active', actionLabel: 'View job' })

check('provider · method set, future schedule wins',
  pick(jobNextMove({ status: 'accepted', scheduled_date: future }, 'provider', { paymentMethod: 'bank_transfer' })),
  { label: `Scheduled for ${futureWeekday}`, detail: 'You are booked for this job', needsAction: false, tone: 'scheduled', actionLabel: null })

check('provider · marked paid',
  pick(jobNextMove({ status: 'accepted' }, 'provider', { paymentMethod: 'cash', paymentMarkedSentAt: '2026-11-09T00:00:00Z' })),
  { label: 'Payment marked sent', detail: "Check it's arrived, then mark the job complete", needsAction: true, tone: 'active', actionLabel: 'View job' })

check('provider · in_progress behaves like accepted (no method)',
  pick(jobNextMove({ status: 'in_progress' }, 'provider', {})),
  { label: 'Waiting on you', detail: "Confirm timing and how you'd like to be paid", needsAction: true, tone: 'attention', actionLabel: 'Next steps' })

// ---- Requester, accepted/in_progress ----
check('requester · no method',
  pick(jobNextMove({ status: 'accepted' }, 'requester', {})),
  { label: 'Waiting on the provider', detail: "They'll confirm timing and how to pay", needsAction: false, tone: 'waiting', actionLabel: null })

check('requester · bank, not paid, no/past schedule → pay now (needsAction)',
  pick(jobNextMove({ status: 'accepted', scheduled_date: past }, 'requester', { paymentMethod: 'bank_transfer' })),
  { label: 'Waiting on you', detail: "Pay the provider when the work's done", needsAction: true, tone: 'attention', actionLabel: 'View job' })

check('requester · invoice → same pay-when-done copy',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'invoice' })),
  { label: 'Waiting on you', detail: "Pay the provider when the work's done", needsAction: true, tone: 'attention', actionLabel: 'View job' })

check('requester · cash → pay on the day',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash' })),
  { label: 'Waiting on you', detail: 'Pay on the day', needsAction: true, tone: 'attention', actionLabel: 'View job' })

check('requester · agreed → pay as agreed',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'agreed' })),
  { label: 'Waiting on you', detail: 'Pay as agreed', needsAction: true, tone: 'attention', actionLabel: 'View job' })

check('requester · method set, future schedule → scheduled, no needsAction',
  pick(jobNextMove({ status: 'accepted', scheduled_date: future }, 'requester', { paymentMethod: 'bank_transfer' })),
  { label: 'Waiting on you', detail: "Pay the provider when the work's done", needsAction: false, tone: 'scheduled', actionLabel: null })

check('requester · marked paid',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'cash', paymentMarkedSentAt: '2026-11-09T00:00:00Z' })),
  { label: 'Waiting on the provider', detail: "They'll mark the job complete", needsAction: false, tone: 'waiting', actionLabel: null })

check('requester · otherName used for first name in pay copy',
  pick(jobNextMove({ status: 'accepted' }, 'requester', { paymentMethod: 'invoice', otherName: 'Sam Rata' })),
  { label: 'Waiting on you', detail: "Pay Sam when the work's done", needsAction: true, tone: 'attention', actionLabel: 'View job' })

// ---- Regression: untouched branches ----
check('open · requester with offers',
  pick(jobNextMove({ status: 'open' }, 'requester', { bidCount: 2 })),
  { label: 'Waiting on you', detail: 'Review and choose from 2 offers', needsAction: true, tone: 'attention', actionLabel: 'Review offers' })

check('open · provider pending bid',
  pick(jobNextMove({ status: 'open' }, 'provider', { hasPendingBid: true })),
  { label: 'Waiting on the requester', detail: 'Your offer is being considered', needsAction: false, tone: 'waiting', actionLabel: null })

check('completed → null', jobNextMove({ status: 'completed' }, 'provider', {}), null)

console.log(`\n✅ jobNextMove payment handoff: all ${passed} cases passed`)
