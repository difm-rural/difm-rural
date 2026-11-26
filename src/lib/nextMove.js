import { supabase } from './supabase'
import { BOOKING_ACTIVE_STATUSES, JOB_ACTIVE_STATUSES } from './lifecycle'
import { jobNextMove, bookingNextMove } from '../../shared/nextMove'
import { loadReviewPrompts } from '../../shared/reviewPrompts'

// Pure next-step logic now lives in shared/nextMove.ts (UI-free, reused by
// provider-web). Re-exported here so existing mobile imports from
// '../lib/nextMove' keep working unchanged.
export { jobNextMove, bookingNextMove }

// Home's "Needs attention" only needs items where the signed-in user must act.
export async function fetchActionableNextMoves(userId, isProvider) {
  return (await fetchActiveNextMoves(userId, isProvider)).filter(item => item.nextMove.needsAction)
}

// Everything in flight with a next move — your active jobs, your pending offers
// on open jobs, jobs you're doing, and bookings on either side. Home's "On the
// go" ranks these (shared/onTheGo). Each item carries `updatedAt`: the
// timestamps that mark activity on it (there is no updated_at column).
export async function fetchActiveNextMoves(userId, isProvider, {strict=false}={}) {
  if (!userId) return []

  const [jobsResult, requesterBookingsResult, providerBookingsResult, providerJobBidsResult] = await Promise.all([
    supabase
      .from('jobs')
      .select('*')
      .eq('requester_id', userId)
      .in('status', JOB_ACTIVE_STATUSES)
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('*, services:services_public(*)')
      .eq('requester_id', userId)
      .in('status', BOOKING_ACTIVE_STATUSES)
      .order('created_at', { ascending: false }),
    isProvider
      ? supabase
          .from('bookings')
          .select('*, services:services_public(*)')
          .eq('provider_id', userId)
          .in('status', BOOKING_ACTIVE_STATUSES)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    // Jobs the user is the accepted provider on. The embed reads base jobs, which
    // is allowed here because it's filtered to the viewer's own accepted bids.
    // Anyone can make an offer, so this isn't limited to provider accounts.
    supabase
      .from('bids')
      .select('id, job_id, created_at, payment_method, payment_sorted_at, payment_details_sent_at, jobs!inner(*)')
      .eq('provider_id', userId)
      .eq('status', 'accepted')
      .eq('jobs.status', 'accepted'),
  ])

  const jobs = jobsResult.data || []
  // Pending offers: ids first, then the public job view (never embed base jobs
  // for offers that haven't been accepted — see CLAUDE.md location privacy).
  const { data: pendingBids,error: pendingOffersError } = await supabase
    .from('bids').select('id, job_id, created_at').eq('provider_id', userId).eq('status', 'pending')
  const pendingJobIds = [...new Set((pendingBids || []).map(bid => bid.job_id).filter(Boolean))]
  const { data: pendingJobsData,error: pendingJobsError } = pendingJobIds.length
    ? await supabase.from('jobs_public').select('*').in('id', pendingJobIds).eq('status', 'open')
    : { data: [] }
  const pendingJobs = new Map((pendingJobsData || []).map(job => [job.id, job]))
  const requesterBookings = requesterBookingsResult.data || []
  const providerBookings = providerBookingsResult.data || []
  const providerJobs = (providerJobBidsResult.data || [])
    .map(bid => ({ bid, job: bid.jobs }))
    .filter(entry => entry.job)
  const jobIds = jobs.map(job => job.id)
  const awardedJobIds = jobs.filter(job => job.status === 'accepted').map(job => job.id)
  const scheduledIds=[...new Set([...awardedJobIds,...providerJobs.map(({job})=>job.id)])]
  const schedules=scheduledIds.length
    ? await supabase.from('work_schedules').select('job_id,arrival_start_at').in('job_id',scheduledIds)
    : {data:[]}
  if(strict&&([jobsResult,requesterBookingsResult,providerBookingsResult,providerJobBidsResult,schedules].some(result=>result.error)
    ||pendingOffersError||pendingJobsError))throw new Error('Could not load active work')
  const arrivals=new Map((schedules.data||[]).map(row=>[row.job_id,row.arrival_start_at]))
  const confirmation=id=>schedules.error?{}:{hasArrival:!!arrivals.get(id),arrivalAt:arrivals.get(id)}
  const otherIds = [
    ...requesterBookings.map(booking => booking.provider_id),
    ...providerBookings.map(booking => booking.requester_id),
    ...providerJobs.map(entry => entry.job.requester_id),
    ...[...pendingJobs.values()].map(job => job.requester_id),
  ].filter(Boolean)

  // Requester side: who the accepted provider is, for their name in the badge.
  const { data: awardedBids } = awardedJobIds.length
    ? await supabase.from('bids').select('job_id, provider_id, payment_method, payment_sorted_at, payment_details_sent_at').in('job_id', awardedJobIds).eq('status', 'accepted')
    : { data: [] }
  otherIds.push(...(awardedBids || []).map(bid => bid.provider_id).filter(Boolean))

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
  // Payment state + provider on the requester's own awarded jobs (the accepted bid).
  const payByJob = {}
  ;(awardedBids || []).forEach(row => {
    payByJob[row.job_id] = { method: row.payment_method, sorted: row.payment_sorted_at, sent: row.payment_details_sent_at, provider: row.provider_id }
  })

  const items = []

  jobs.forEach(job => {
    const pay = payByJob[job.id] || {}
    const nextMove = jobNextMove(job, 'requester', {
      ...confirmation(job.id),
      otherName: pay.provider ? names[pay.provider] : null,
      bidCount: bidCounts[job.id] || 0,
      unansweredQuestionCount: questionCounts[job.id] || 0,
      paymentMethod: pay.method,
      paymentSortedAt: pay.sorted,
    })
    if (nextMove) {
      items.push({
        id: `next-job-${job.id}`,
        entityType: 'job',
        entityId: job.id,
        viewerRole: 'requester',
        title: job.title,
        item: { ...job, bidCount: bidCounts[job.id] || 0, unansweredQuestionCount: questionCounts[job.id] || 0, _viewerRole: 'requester' },
        nextMove,
        createdAt: job.created_at,
        updatedAt: [job.created_at, job.accepted_at, pay.sent, pay.sorted],
      })
    }
  })

  ;(pendingBids || []).forEach(bid => {
    const job = pendingJobs.get(bid.job_id)
    if (!job) return
    const nextMove = jobNextMove(job, 'provider', { otherName: names[job.requester_id], hasPendingBid: true })
    if (nextMove) {
      items.push({
        id: `next-offer-${bid.id}`,
        entityType: 'job',
        entityId: job.id,
        viewerRole: 'provider',
        title: job.title,
        item: { ...job, _viewerRole: 'provider' },
        nextMove,
        createdAt: bid.created_at,
        updatedAt: [bid.created_at],
      })
    }
  })

  providerJobs.forEach(({ bid, job }) => {
    const nextMove = jobNextMove(job, 'provider', {
      ...confirmation(job.id),
      otherName: names[job.requester_id],
      paymentMethod: bid.payment_method,
      paymentSortedAt: bid.payment_sorted_at,
    })
    if (nextMove) {
      items.push({
        id: `next-provider-job-${job.id}`,
        arrivalAt: arrivals.get(job.id),
        entityType: 'job',
        entityId: job.id,
        viewerRole: 'provider',
        title: job.title,
        item: { ...job, _viewerRole: 'provider' },
        nextMove,
        createdAt: job.created_at,
        updatedAt: [bid.created_at, job.accepted_at, bid.payment_details_sent_at, bid.payment_sorted_at],
      })
    }
  })

  requesterBookings.forEach(booking => {
    const enriched = { ...booking, service: booking.services }
    const nextMove = bookingNextMove(enriched, 'requester', { otherName: names[booking.provider_id] })
    if (nextMove) {
      items.push({
        id: `next-requester-booking-${booking.id}`,
        entityType: 'booking',
        entityId: booking.id,
        viewerRole: 'requester',
        title: booking.services?.title || 'Service booking',
        item: enriched,
        nextMove,
        createdAt: booking.created_at,
        updatedAt: [booking.created_at, booking.quote_sent_at, booking.quote_accepted_at],
      })
    }
  })

  providerBookings.forEach(booking => {
    const enriched = { ...booking, service: booking.services }
    const nextMove = bookingNextMove(enriched, 'provider', { otherName: names[booking.requester_id] })
    if (nextMove) {
      items.push({
        id: `next-provider-booking-${booking.id}`,
        entityType: 'booking',
        entityId: booking.id,
        viewerRole: 'provider',
        title: booking.services?.title || 'Service booking',
        item: enriched,
        nextMove,
        createdAt: booking.created_at,
        updatedAt: [booking.created_at, booking.quote_sent_at, booking.quote_accepted_at],
      })
    }
  })

  // Completed work you haven't reviewed yet stays until you do (best-effort).
  const reviews = await loadReviewPrompts(supabase, userId).catch(() => [])
  ;(reviews || []).forEach(prompt => {
    items.push({
      id: prompt.key,
      entityType: prompt.kind,
      entityId: prompt.id,
      viewerRole: prompt.viewerRole,
      title: prompt.title,
      item: { id: prompt.id, title: prompt.title, status: 'completed', _viewerRole: prompt.viewerRole },
      nextMove: prompt.next,
      createdAt: prompt.updatedAt[0],
      updatedAt: prompt.updatedAt,
    })
  })

  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}
