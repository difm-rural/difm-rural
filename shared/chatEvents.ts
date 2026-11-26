// Automatic chat notes written by the database, not typed by either person.
// `mark_payment_sorted` inserts one of these as a message from whoever tapped
// the button, so without this they render as an ordinary "You:" bubble and the
// payment reads as announced twice. Show them as a neutral status line instead.
const PAYMENT_EVENTS: Record<string, {mine: string; theirs: (name: string) => string}> = {
  'Payment all taken care of ✓': {
    mine: 'You marked payment as sorted ✓',
    theirs: name => name + ' marked payment as sorted ✓',
  },
  'Payment marked as not sorted yet': {
    mine: 'You marked payment as not sorted yet',
    theirs: name => name + ' marked payment as not sorted yet',
  },
}

export function isChatEvent(content: unknown): boolean {
  return typeof content === 'string' && Object.prototype.hasOwnProperty.call(PAYMENT_EVENTS, content.trim())
}

// The status line for an automatic note, or null for an ordinary message.
export function chatEventText(content: unknown, mine: boolean, otherName?: string | null): string | null {
  if (!isChatEvent(content)) return null
  const event = PAYMENT_EVENTS[(content as string).trim()]
  const first = otherName && otherName !== 'Community member' ? otherName.trim().split(/\s+/)[0] : ''
  return mine ? event.mine : event.theirs(first || 'The other person')
}
