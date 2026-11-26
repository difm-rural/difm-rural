export const paymentAcknowledgement = {
  reminder: 'Please arrange payment directly with the other person, as agreed between you.',
  sorted: 'Payment sorted',
  mark: 'Mark payment as sorted',
  undo: 'Undo payment acknowledgement',
  undoTitle: 'Undo payment acknowledgement?',
  undoDetail: 'This will remove the payment acknowledgement. You can mark payment as sorted again later.',
  undoConfirm: 'Undo acknowledgement',
  removed: 'Payment acknowledgement removed.',
  error: 'Could not update the payment acknowledgement. Please try again.',
} as const

export function paymentAcknowledgementActor(sortedBy?: string | null, requesterId?: string | null, providerId?: string | null) {
  if (!sortedBy) return null
  if (sortedBy === requesterId) return 'requester'
  if (sortedBy === providerId) return 'provider'
  return null
}

// Payment can still be marked sorted after completion (people often pay
// afterwards), but once a completed job's payment is sorted it is settled:
// no Undo. Pass `sortedAt` to apply that.
export function paymentAcknowledgementAvailable(status: string, bidStatus: string, participant: boolean, sortedAt?: string | null) {
  if (status === 'completed' && sortedAt) return false
  return participant && bidStatus === 'accepted' && (status === 'accepted' || status === 'completed')
}

export const agreedPaymentMethodLabels: Record<string, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  invoice: 'Invoice',
  agreed: 'Arranged directly between you',
}
