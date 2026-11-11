// Pure next-step logic shared by the mobile app and provider-web. UI-free: no
// supabase, no React. A status says where an item is; a next move says who
// should do what now.
//
// src/lib/nextMove.js re-exports jobNextMove + bookingNextMove from here and
// keeps the data-fetching fetchActionableNextMoves. provider-web imports
// jobNextMove from '@shared/nextMove'.
import { bookingPricingType } from './listingEstimate'

export type NextMove = {
  label: string
  detail: string
  needsAction: boolean
  tone: string
  icon: string
  actionLabel: string | null
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

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

function scheduledLabel(item: Scheduleable | null | undefined): string | null {
  const date = parseDate(item?.scheduled_date || item?.date_from)
  if (!date || date < new Date(new Date().setHours(0, 0, 0, 0))) return null
  const day = date.toLocaleDateString('en-NZ', { weekday: 'long' })
  return `Scheduled for ${day}`
}

function move(label: string, detail: string, opts: Partial<Omit<NextMove, 'label' | 'detail'>> = {}): NextMove {
  const { needsAction = false, tone = 'waiting', icon = 'time-outline', actionLabel = null } = opts
  return { label, detail, needsAction, tone, icon, actionLabel }
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
    paymentMarkedSentAt = null,
    hasArrival = true,
  }: {
    otherName?: string | null
    bidCount?: number
    unansweredQuestionCount?: number
    hasPendingBid?: boolean
    paymentMethod?: string | null
    paymentMarkedSentAt?: string | null
    hasArrival?: boolean
  } = {},
): NextMove | null {
  if (!job) return null
  const other = firstName(otherName, viewerRole === 'requester' ? 'the provider' : 'the requester')

  if (job.status === 'open') {
    if (viewerRole === 'requester' && unansweredQuestionCount > 0) {
      return move(
        'Waiting on you',
        unansweredQuestionCount === 1 ? 'Answer a provider question' : `Answer ${unansweredQuestionCount} provider questions`,
        { needsAction: true, tone: 'attention', icon: 'chatbubble-ellipses-outline', actionLabel: 'Answer' },
      )
    }
    if (viewerRole === 'requester' && bidCount > 0) {
      return move(
        'Waiting on you',
        bidCount === 1 ? 'Review and choose an offer' : `Review and choose from ${bidCount} offers`,
        { needsAction: true, tone: 'attention', icon: 'hand-left-outline', actionLabel: 'Review offers' },
      )
    }
    if (viewerRole === 'provider' && hasPendingBid) {
      return move(`Waiting on ${other}`, 'Your offer is being considered')
    }
    return move('No response yet', 'The job is open to local providers', { tone: 'muted', icon: 'hourglass-outline' })
  }

  if (job.status === 'accepted' || job.status === 'in_progress') {
    // A future-dated schedule label (null once the date has passed / none set).
    const schedule = scheduledLabel(job)
    const method = paymentMethod || null
    const paid = !!paymentMarkedSentAt

    // One step first: confirm the arrival time and how to get paid. Until both
    // are set, everything else waits on that.
    if (!hasArrival || !method) {
      if (viewerRole === 'provider') {
        return move('Waiting on you', 'Confirm the job — arrival time and how to get paid', {
          needsAction: true, tone: 'attention', icon: 'calendar-outline', actionLabel: 'Confirm job',
        })
      }
      return move(`Waiting on ${other}`, "They'll confirm the arrival time and how to pay")
    }

    if (viewerRole === 'provider') {
      // Step 3: requester says they've paid → check, then complete.
      if (paid) {
        return move('Payment marked sent', "Check it's arrived, then mark the job complete", {
          needsAction: true, tone: 'active', icon: 'checkmark-done-outline', actionLabel: 'View job',
        })
      }
      // Step 2: method set, doing the work — a future schedule still wins.
      if (schedule) {
        return move(schedule, 'You are booked for this job', { tone: 'scheduled', icon: 'calendar-outline' })
      }
      return move('Waiting on you', 'Complete the work, then mark it complete', {
        tone: 'active', icon: 'construct-outline', actionLabel: 'View job',
      })
    }

    // Requester side (job is confirmed: arrival + method set).
    if (paid) {
      return move(`Waiting on ${other}`, "They'll mark the job complete")
    }
    // Method set, not paid → it's the requester's turn to pay.
    const detail = method === 'cash' ? 'Pay on the day'
      : method === 'agreed' ? 'Pay as agreed'
      : `Pay ${other} when the work's done`   // bank_transfer | invoice
    return move('Waiting on you', detail, {
      needsAction: !schedule,                 // only chase once the scheduled date has passed
      tone: schedule ? 'scheduled' : 'attention',
      icon: 'card-outline',
      actionLabel: schedule ? null : 'View job',
    })
  }

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
        ? move('Waiting on you', 'Send a quote or decline the request', {
            needsAction: true, tone: 'attention', icon: 'document-text-outline', actionLabel: 'Send quote',
          })
        : move('Waiting on you', 'Confirm or decline the booking', {
            needsAction: true, tone: 'attention', icon: 'calendar-outline', actionLabel: 'Respond',
          })
    }
    return move(`Waiting on ${other}`, quoteRequired ? 'A quote is needed' : 'Booking confirmation is needed')
  }

  if (booking.status === 'quote_sent') {
    if (viewerRole === 'requester') {
      return move('Waiting on you', 'Review and accept the quote', {
        needsAction: true, tone: 'attention', icon: 'document-text-outline', actionLabel: 'Review quote',
      })
    }
    return move(`Waiting on ${other}`, 'Your quote is ready for review')
  }

  if (booking.status === 'confirmed' || booking.status === 'in_progress') {
    if ((service as { kind?: string }).kind === 'grazing') {
      return move('Grazing arrangement accepted', 'Use Chat to agree ongoing grazing details, dates and payment directly with each other.'
        + (viewerRole === 'provider' ? ' When the arrangement has finished, choose Complete arrangement to close the listing or relist for new requests.' : ''), {
        tone: 'active', icon: 'chatbubble-outline', actionLabel: 'View booking',
      })
    }
    const schedule = scheduledLabel(booking)
    if (schedule) {
      return move(schedule, viewerRole === 'provider' ? 'You are booked for this service' : `${other} is booked`, {
        tone: 'scheduled',
        icon: 'calendar-outline',
      })
    }
    if (viewerRole === 'provider') {
      return move('Waiting on you', 'Complete the service, then mark it complete', {
        tone: 'active',
        icon: 'construct-outline',
        actionLabel: 'View booking',
      })
    }
    return move(`Waiting on ${other}`, 'They will mark the service complete when finished')
  }

  if (booking.status === 'cancellation_requested') {
    if (viewerRole === 'provider') {
      return move('Waiting on you', 'Respond to the cancellation request', {
        needsAction: true, tone: 'attention', icon: 'alert-circle-outline', actionLabel: 'Respond',
      })
    }
    return move(`Waiting on ${other}`, 'Cancellation needs their confirmation')
  }

  return null
}
