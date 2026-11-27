// "Payment received": the provider records that they've been paid, once the job
// is complete. A reminder for them and a record for us; nothing is sent to the
// requester (no chat line, no notification). The requester sees the status.
export const paymentAcknowledgement = {
  reminder: 'Please arrange payment directly with the other person, as agreed between you.',
  providerReminder: "Once you've been paid, mark it here. It's just for your records; nothing is sent.",
  sorted: 'Payment received ✓',
  mark: 'Mark payment received',
  undo: 'Undo payment received',
  undoTitle: 'Undo payment received?',
  undoDetail: "This removes the record that you've been paid. You can mark it again later.",
  undoConfirm: 'Undo',
  removed: 'Payment received removed.',
  error: 'Could not update the payment record. Please try again.',
} as const

export function paymentAcknowledgementActor(sortedBy?: string | null, requesterId?: string | null, providerId?: string | null) {
  if (!sortedBy) return null
  if (sortedBy === requesterId) return 'requester'
  if (sortedBy === providerId) return 'provider'
  return null
}

// Only the provider, only once the job is complete (they can undo a mis-tap).
// The fourth argument is accepted for older callers and ignored.
export function paymentAcknowledgementAvailable(status: string, bidStatus: string, isProvider: boolean, _sortedAt?: string | null) {
  return isProvider && bidStatus === 'accepted' && status === 'completed'
}

export const agreedPaymentMethodLabels: Record<string, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  invoice: 'Invoice',
  agreed: 'Arranged directly between you',
}
