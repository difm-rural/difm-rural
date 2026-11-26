// Automatic chat notes written by the database, not typed by either person.
// `mark_payment_sorted` and `confirm_job` insert these as a message from
// whoever tapped the button, so without this they render as an ordinary "You:"
// bubble. Show them as a neutral status line instead, naming who did it.
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

// confirm_job: "Confirmed: I'll be there around <when>.\n<payment line>…\n\n<provider's own note>"
const CONFIRMED_PREFIX = "Confirmed: I'll be there around "

function personName(name?: string | null) {
  const full = name?.trim()
  // First name, like the rest of the app ("Waiting on Sam to confirm").
  return full && full !== 'Community member' && full !== 'Member' ? full.split(/\s+/)[0] : 'The other person'
}

export function isChatEvent(content: unknown): boolean {
  if (typeof content !== 'string') return false
  return Object.prototype.hasOwnProperty.call(PAYMENT_EVENTS, content.trim()) || content.startsWith(CONFIRMED_PREFIX)
}

// The status text for an automatic note (may span lines), or null for an
// ordinary message.
export function chatEventText(content: unknown, mine: boolean, otherName?: string | null): string | null {
  if (!isChatEvent(content)) return null
  const text = content as string
  const who = mine ? 'You' : personName(otherName)
  if (text.startsWith(CONFIRMED_PREFIX)) {
    const [first, ...rest] = text.split('\n')
    const when = first.slice(CONFIRMED_PREFIX.length).replace(/\.$/, '')
    return [who + ' confirmed the job: arriving around ' + when + '.', ...rest].join('\n')
  }
  const event = PAYMENT_EVENTS[text.trim()]
  return mine ? event.mine : event.theirs(who)
}

// One line for inbox previews.
export function chatEventPreview(content: unknown, mine: boolean, otherName?: string | null): string | null {
  return chatEventText(content, mine, otherName)?.split('\n')[0] ?? null
}
