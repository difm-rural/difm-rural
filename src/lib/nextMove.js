import { supabase } from './supabase'
import { BOOKING_ACTIVE_STATUSES, JOB_ACTIVE_STATUSES } from './lifecycle'

function firstName(name, fallback) {
  const value = String(name || '').trim()
  return value ? value.split(/\s+/)[0] : fallback
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

function scheduledLabel(item) {
  const date = parseDate(item?.scheduled_date || item?.date_from)
  if (!date || date < new Date(new Date().setHours(0, 0, 0, 0))) return null
  const day = date.toLocaleDateString('en-NZ', { weekday: 'long' })
  return `Scheduled for ${day}`
}

function move(label, detail, {
  needsAction = false,
  tone = 'waiting',
  icon = 'time-outline',
  actionLabel = null,
} = {}) {
  return { label, detail, needsAction, tone, icon, actionLabel }
}

// A status says where an item is. A next move says who should do what now.
export function jobNextMove(job, viewerRole, {
  otherName,
  bidCount = job?.bidCount || 0,
  unansweredQuestionCount = job?.unansweredQuestionCount || 0,
  hasPendingBid = false,
} = {}) {
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
    const schedule = scheduledLabel(job)
    if (schedule) {
      return move(schedule, viewerRole === 'provider' ? 'You are booked for this job' : `${other} is booked for this job`, {
        tone: 'scheduled',
        icon: 'calendar-outline',
      })
    }
    if (viewerRole === 'provider') {
      return move('Waiting on you', 'Complete the work, then mark it ready', {
        tone: 'active',
        icon: 'construct-outline',
        actionLabel: 'View job',
      })
    }
    return move(`Waiting on ${other}`, 'They will mark the job ready when finished')
  }

  if (job.status === 'awaiting_completion') {
    if (viewerRole === 'requester') {
      return move('Ready to confirm', 'Confirm that the work is complete', {
        needsAction: true,
        tone: 'attention',
        icon: 'checkmark-circle-outline',
        actionLabel: 'Confirm',
      })
    }
    return move(`Waiting on ${other}`, 'Completion is ready for confirmation')
  }

  return null
}

export function bookingNextMove(booking, viewerRole, { otherName } = {}) {
  if (!booking) return null
  const service = booking.service || booking.services || {}
  const other = firstName(otherName, viewerRole === 'requester' ? 'the provider' : 'the requester')
  const quoteRequired = service.pricing_type === 'quote_required'

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
    const schedule = scheduledLabel(booking)
    if (schedule) {
      return move(schedule, viewerRole === 'provider' ? 'You are booked for this service' : `${other} is booked`, {
        tone: 'scheduled',
        icon: 'calendar-outline',
      })
    }
    if (viewerRole === 'provider') {
      return move('Waiting on you', 'Complete the service, then mark it ready', {
        tone: 'active',
        icon: 'construct-outline',
        actionLabel: 'View booking',
      })
    }
    return move(`Waiting on ${other}`, 'They will mark the service ready when finished')
  }

  if (booking.status === 'awaiting_completion') {
    if (viewerRole === 'requester') {
      return move('Ready to confirm', 'Confirm that the service is complete', {
        needsAction: true, tone: 'attention', icon: 'checkmark-circle-outline', actionLabel: 'Confirm',
      })
    }
    return move(`Waiting on ${other}`, 'Completion is ready for confirmation')
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

// Home only needs items where the signed-in user must act. Waiting/scheduled
// certainty belongs on Activity cards and detail screens, not in an urgent list.
export async function fetchActionableNextMoves(userId, isProvider) {
  if (!userId) return []

  const [jobsResult, requesterBookingsResult, providerBookingsResult] = await Promise.all([
    supabase
      .from('jobs')
      .select('*')
      .eq('requester_id', userId)
      .in('status', JOB_ACTIVE_STATUSES)
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('*, services(*)')
      .eq('requester_id', userId)
      .in('status', BOOKING_ACTIVE_STATUSES)
      .order('created_at', { ascending: false }),
    isProvider
      ? supabase
          .from('bookings')
          .select('*, services(*)')
          .eq('provider_id', userId)
          .in('status', BOOKING_ACTIVE_STATUSES)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const jobs = jobsResult.data || []
  const requesterBookings = requesterBookingsResult.data || []
  const providerBookings = providerBookingsResult.data || []
  const jobIds = jobs.map(job => job.id)
  const otherIds = [
    ...requesterBookings.map(booking => booking.provider_id),
    ...providerBookings.map(booking => booking.requester_id),
  ].filter(Boolean)

  const [bidsResult, questionsResult, profilesResult] = await Promise.all([
    jobIds.length
      ? supabase.from('bids').select('job_id').in('job_id', jobIds).eq('status', 'pending')
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase.from('job_questions').select('job_id').in('job_id', jobIds).is('answer', null)
      : Promise.resolve({ data: [] }),
    otherIds.length
      ? supabase.from('profiles_public').select('id, full_name').in('id', [...new Set(otherIds)])
      : Promise.resolve({ data: [] }),
  ])

  const bidCounts = {}
  ;(bidsResult.data || []).forEach(row => { bidCounts[row.job_id] = (bidCounts[row.job_id] || 0) + 1 })
  const questionCounts = {}
  ;(questionsResult.data || []).forEach(row => { questionCounts[row.job_id] = (questionCounts[row.job_id] || 0) + 1 })
  const names = {}
  ;(profilesResult.data || []).forEach(profile => { names[profile.id] = profile.full_name })

  const items = []

  jobs.forEach(job => {
    const nextMove = jobNextMove(job, 'requester', {
      bidCount: bidCounts[job.id] || 0,
      unansweredQuestionCount: questionCounts[job.id] || 0,
    })
    if (nextMove?.needsAction) {
      items.push({
        id: `next-job-${job.id}`,
        entityType: 'job',
        entityId: job.id,
        title: job.title,
        item: { ...job, bidCount: bidCounts[job.id] || 0, unansweredQuestionCount: questionCounts[job.id] || 0 },
        nextMove,
        createdAt: job.created_at,
      })
    }
  })

  requesterBookings.forEach(booking => {
    const enriched = { ...booking, service: booking.services }
    const nextMove = bookingNextMove(enriched, 'requester', { otherName: names[booking.provider_id] })
    if (nextMove?.needsAction) {
      items.push({
        id: `next-requester-booking-${booking.id}`,
        entityType: 'booking',
        entityId: booking.id,
        viewerRole: 'requester',
        title: booking.services?.title || 'Service booking',
        item: enriched,
        nextMove,
        createdAt: booking.created_at,
      })
    }
  })

  providerBookings.forEach(booking => {
    const enriched = { ...booking, service: booking.services }
    const nextMove = bookingNextMove(enriched, 'provider', { otherName: names[booking.requester_id] })
    if (nextMove?.needsAction) {
      items.push({
        id: `next-provider-booking-${booking.id}`,
        entityType: 'booking',
        entityId: booking.id,
        viewerRole: 'provider',
        title: booking.services?.title || 'Service booking',
        item: enriched,
        nextMove,
        createdAt: booking.created_at,
      })
    }
  })

  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}
