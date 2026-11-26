// Pure next-step logic shared by the mobile app and provider-web. UI-free: no
// supabase, no React. A status says where an item is; a next move says who
// should do what now.
//
// src/lib/nextMove.js re-exports jobNextMove + bookingNextMove from here and
// keeps the data-fetching fetchActionableNextMoves. provider-web imports
// jobNextMove from '@shared/nextMove'.
import { bookingPricingType } from './listingEstimate.ts'
import { nzCalendarDay, nzToday } from './postingDates.ts'

export type NextMove = {
  label: string
  detail: string
  needsAction: boolean
  tone: string
  icon: string
  actionLabel: string | null
  // Short "whose turn + what's next" label for the top of a card, shown in place
  // of the raw status: 'Waiting on you to confirm', 'Waiting on Sam to complete'.
  badge: string
  // The same, for narrow cards: 'Your turn' / "Sam's turn". Labels that are
  // nobody's turn ('Waiting for offers', 'Arrangement accepted') stay as they are.
  badgeShort: string
  // 'attention' when the viewer must act now, otherwise 'muted'.
  badgeTone: 'attention' | 'muted'
}

type Scheduleable = { scheduled_date?: string | null; date_from?: string | null }

type JobLike = Scheduleable & {
  status?: string
  bidCount?: number
  unansweredQuestionCount?: number
}

type BookingLike = Scheduleable & {
  status?: string
  pricing_snapshot?: unknown
  service?: { kind?: string | null; pricing_type?: string | null } | null
  services?: { pricing_type?: string | null } | null
}

function firstName(name: string | null | undefined, fallback: string): string {
  const value = String(name || '').trim()
  return value ? value.split(/\s+/)[0] : fallback
}

function scheduledLabel(item: Scheduleable | null | undefined): string | null {
  const date = nzCalendarDay(item?.scheduled_date || item?.date_from)
  if (!date || date < nzToday()) return null
  const day = new Date(date + 'T00:00:00Z').toLocaleDateString('en-NZ', { weekday: 'long', timeZone: 'UTC' })
  return `Scheduled for ${day}`
}

function move(badge: string, label: string, detail: string, opts: Partial<Omit<NextMove, 'label' | 'detail' | 'badge' | 'badgeTone'>> = {}): NextMove {
  const { needsAction = false, tone = 'waiting', icon = 'time-outline', actionLabel = null } = opts
  return { label, detail, needsAction, tone, icon, actionLabel, badge, badgeShort: shortBadge(badge), badgeTone: needsAction ? 'attention' : 'muted' }
}

// 'Waiting on you to confirm' → 'Your turn'; 'Waiting on Sam to complete' →
// "Sam's turn"; with no name, 'Waiting on the provider to …' → "Provider's turn".
function shortBadge(badge: string): string {
  const waiting = /^Waiting (?:on|for) (.+) to \w+$/.exec(badge)
  if (!waiting) return badge
  const who = waiting[1]
  if (who === 'you') return 'Your turn'
  const name = who.startsWith('the ') ? who.charAt(4).toUpperCase() + who.slice(5) : who
  return `${name}'s turn`
}

// The heading for a next-move box that sits under a card or page already
// showing the badge. A "Waiting on …" label only repeats the badge, so it is
// dropped (null) and the detail line stands alone; a schedule or state label
// ("Scheduled for Friday", "Job confirmed") adds something and is kept.
export function nextMoveHeading(next: Pick<NextMove, 'label'> | null | undefined): string | null {
  const label = next?.label || ''
  return !label || /^Waiting (on|for) /.test(label) ? null : label
}

export function jobNextMove(
  job: JobLike | null | undefined,
  viewerRole: string,
  {
    otherName,
    bidCount = job?.bidCount || 0,
    unansweredQuestionCount = job?.unansweredQuestionCount || 0,
    hasPendingBid = false,
    paymentMethod = null,
    hasArrival = !!paymentMethod,
    arrivalAt,
  }: {
    otherName?: string | null
    bidCount?: number
    unansweredQuestionCount?: number
    hasPendingBid?: boolean
    paymentMethod?: string | null
    /** Legacy callers may still supply this. Payment never drives the work status. */
    paymentSortedAt?: string | null
    hasArrival?: boolean
    arrivalAt?: string | null
  } = {},
): NextMove | null {
  if (!job) return null
  const other = firstName(otherName, viewerRole === 'requester' ? 'the provider' : 'the requester')

  if (job.status === 'open') {
    if (viewerRole === 'requester' && unansweredQuestionCount > 0) {
      return move(
        'Waiting on you to answer',
        'Waiting on you',
        unansweredQuestionCount === 1 ? 'Answer a provider question' : `Answer ${unansweredQuestionCount} provider questions`,
        { needsAction: true, tone: 'attention', icon: 'chatbubble-ellipses-outline', actionLabel: 'Answer' },
      )
    }
    if (viewerRole === 'requester' && bidCount > 0) {
      return move(
        'Waiting on you to choose',
        'Waiting on you',
        bidCount === 1 ? 'Review and choose an offer' : `Review and choose from ${bidCount} offers`,
        { needsAction: true, tone: 'attention', icon: 'hand-left-outline', actionLabel: 'Review offers' },
      )
    }
    if (viewerRole === 'provider' && hasPendingBid) {
      return move(`Waiting on ${other} to choose`, `Waiting on ${other}`, 'Your offer is being considered')
    }
    return move('Waiting for offers', 'No response yet', 'The job is open to local providers', { tone: 'muted', icon: 'hourglass-outline' })
  }

  if (job.status === 'accepted' || job.status === 'in_progress') {
    // A future-dated schedule label (null once the date has passed / none set).
    const schedule = scheduledLabel(arrivalAt ? { scheduled_date: arrivalAt } : job)
    if (!hasArrival) {
      if (viewerRole === 'provider') {
        return move('Waiting on you to confirm', 'Waiting on you', 'Confirm your arrival time', {
          needsAction: true, tone: 'attention', icon: 'calendar-outline', actionLabel: 'Confirm job',
        })
      }
      return move(`Waiting on ${other} to confirm`, `Waiting on ${other}`, "They'll confirm the arrival time")
    }

    if (viewerRole === 'provider') {
      if (schedule) {
        return move('Waiting on you to complete', schedule, 'You are booked for this job', { tone: 'scheduled', icon: 'calendar-outline' })
      }
      return move('Waiting on you to complete', 'Waiting on you', 'Complete the work, then mark it complete', {
        tone: 'active', icon: 'construct-outline', actionLabel: 'View job',
      })
    }

    return move(`Waiting on ${other} to complete`, schedule || 'Job confirmed', "They'll mark the job complete", {
      tone: schedule ? 'scheduled' : 'waiting', icon: schedule ? 'calendar-outline' : undefined,
    })
  }

  // Completed / cancelled: no next move — cards keep the status word.
  return null
}

export function bookingNextMove(
  booking: BookingLike | null | undefined,
  viewerRole: string,
  { otherName }: { otherName?: string | null } = {},
): NextMove | null {
  if (!booking) return null
  const service = booking.service || booking.services || {}
  const other = firstName(otherName, viewerRole === 'requester' ? 'the provider' : 'the requester')
  const quoteRequired = bookingPricingType(booking) === 'quote_required'

  if (booking.status === 'pending') {
    if (viewerRole === 'provider') {
      return quoteRequired
        ? move('Waiting on you to respond', 'Waiting on you', 'Send a quote or decline the request', {
            needsAction: true, tone: 'attention', icon: 'document-text-outline', actionLabel: 'Send quote',
          })
        : move('Waiting on you to respond', 'Waiting on you', 'Confirm or decline the booking', {
            needsAction: true, tone: 'attention', icon: 'calendar-outline', actionLabel: 'Respond',
          })
    }
    return move(`Waiting for ${other} to ${quoteRequired?'quote':'accept'}`, `Waiting for ${other}`, quoteRequired?'Your request has been sent. A quote is needed before you confirm.':`Your request has been sent. ${other} will review it before the booking is confirmed.`)
  }

  if (booking.status === 'quote_sent') {
    if (viewerRole === 'requester') {
      return move('Waiting on you to respond', 'Waiting on you', 'Review and accept the quote', {
        needsAction: true, tone: 'attention', icon: 'document-text-outline', actionLabel: 'Review quote',
      })
    }
    return move(`Waiting on ${other} to respond`, `Waiting on ${other}`, 'Your quote is ready for review')
  }

  if (booking.status === 'confirmed' || booking.status === 'in_progress') {
    if ((service as { kind?: string }).kind === 'grazing') {
      return move('Grazing booking confirmed', 'Grazing booking confirmed', 'Use Chat to agree the grazing dates, duration, access and payment arrangements.', {
        tone: 'active', icon: 'chatbubble-outline', actionLabel: 'View booking',
      })
    }
    const schedule = scheduledLabel(booking)
    if (schedule) {
      return move(viewerRole === 'provider' ? 'Waiting on you to complete' : `Waiting on ${other} to complete`,
        schedule, viewerRole === 'provider' ? 'You are booked for this service' : `${other} is booked`, {
        tone: 'scheduled',
        icon: 'calendar-outline',
      })
    }
    if (viewerRole === 'provider') {
      return move('Waiting on you to complete', 'Waiting on you', 'Complete the service, then mark it complete', {
        tone: 'active',
        icon: 'construct-outline',
        actionLabel: 'View booking',
      })
    }
    return move(`Waiting on ${other} to complete`, `Waiting on ${other}`, 'They will mark the service complete when finished')
  }

  if (booking.status === 'cancellation_requested') {
    if (viewerRole === 'provider') {
      return move('Waiting on you to respond', 'Waiting on you', 'Respond to the cancellation request', {
        needsAction: true, tone: 'attention', icon: 'alert-circle-outline', actionLabel: 'Respond',
      })
    }
    return move(`Waiting on ${other} to respond`, `Waiting on ${other}`, 'Cancellation needs their confirmation')
  }

  return null
}

// Completed work the viewer hasn't reviewed yet. Without this, Home drops the
// job the moment it completes and nothing prompts the review.
export const REVIEW_PROMPT_DAYS = 30
export function reviewNextMove(otherName: string | null | undefined, viewerRole: string): NextMove {
  const other = firstName(otherName, viewerRole === 'requester' ? 'the provider' : 'the requester')
  return move('Waiting on you to review', 'Waiting on you', `Leave a review for ${other}`, {
    needsAction: true, tone: 'attention', icon: 'star-outline', actionLabel: 'Leave a review',
  })
}
