import { supabase } from './supabase'
import { BOOKING_ACTIVE_STATUSES, JOB_ACTIVE_STATUSES } from './lifecycle'
import { jobNextMove, bookingNextMove } from '../../shared/nextMove'

// Pure next-step logic now lives in shared/nextMove.ts (UI-free, reused by
// provider-web). Re-exported here so existing mobile imports from
// '../lib/nextMove' keep working unchanged.
export { jobNextMove, bookingNextMove }

// Home only needs items where the signed-in user must act. Waiting/scheduled
// certainty belongs on Activity cards and detail screens, not in an urgent list.
export async function fetchActionableNextMoves(userId, isProvider) {
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
    // Jobs the user is the accepted provider on. The embed reads base jobs, which
    // is allowed here because it's filtered to the viewer's own accepted bids.
    isProvider
      ? supabase
          .from('bids')
          .select('id, job_id, payment_method, payment_marked_sent_at, jobs!inner(*)')
          .eq('provider_id', userId)
          .eq('status', 'accepted')
          .in('jobs.status', ['accepted', 'in_progress'])
      : Promise.resolve({ data: [] }),
  ])

  const jobs = jobsResult.data || []
  const requesterBookings = requesterBookingsResult.data || []
  const providerBookings = providerBookingsResult.data || []
  const providerJobs = (providerJobBidsResult.data || [])
    .map(bid => ({ bid, job: bid.jobs }))
    .filter(entry => entry.job)
  const jobIds = jobs.map(job => job.id)
  const awardedJobIds = jobs.filter(job => ['accepted', 'in_progress'].includes(job.status)).map(job => job.id)
  const otherIds = [
    ...requesterBookings.map(booking => booking.provider_id),
    ...providerBookings.map(booking => booking.requester_id),
    ...providerJobs.map(entry => entry.job.requester_id),
  ].filter(Boolean)

  const [bidsResult, questionsResult, profilesResult, reqPaymentResult] = await Promise.all([
    jobIds.length
      ? supabase.from('bids').select('job_id').in('job_id', jobIds).eq('status', 'pending')
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase.from('job_questions').select('job_id').in('job_id', jobIds).is('answer', null)
      : Promise.resolve({ data: [] }),
    otherIds.length
      ? supabase.from('profiles_public').select('id, full_name').in('id', [...new Set(otherIds)])
      : Promise.resolve({ data: [] }),
    // Payment state on the requester's own awarded jobs (the accepted bid).
    awardedJobIds.length
      ? supabase.from('bids').select('job_id, payment_method, payment_marked_sent_at').in('job_id', awardedJobIds).eq('status', 'accepted')
      : Promise.resolve({ data: [] }),
  ])

  const bidCounts = {}
  ;(bidsResult.data || []).forEach(row => { bidCounts[row.job_id] = (bidCounts[row.job_id] || 0) + 1 })
  const questionCounts = {}
  ;(questionsResult.data || []).forEach(row => { questionCounts[row.job_id] = (questionCounts[row.job_id] || 0) + 1 })
  const names = {}
  ;(profilesResult.data || []).forEach(profile => { names[profile.id] = profile.full_name })
  const payByJob = {}
  ;(reqPaymentResult.data || []).forEach(row => { payByJob[row.job_id] = { method: row.payment_method, marked: row.payment_marked_sent_at } })

  const items = []

  jobs.forEach(job => {
    const pay = payByJob[job.id] || {}
    const nextMove = jobNextMove(job, 'requester', {
      bidCount: bidCounts[job.id] || 0,
      unansweredQuestionCount: questionCounts[job.id] || 0,
      paymentMethod: pay.method,
      paymentMarkedSentAt: pay.marked,
    })
    if (nextMove?.needsAction) {
      items.push({
        id: `next-job-${job.id}`,
        entityType: 'job',
        entityId: job.id,
        viewerRole: 'requester',
        title: job.title,
        item: { ...job, bidCount: bidCounts[job.id] || 0, unansweredQuestionCount: questionCounts[job.id] || 0, _viewerRole: 'requester' },
        nextMove,
        createdAt: job.created_at,
      })
    }
  })

  providerJobs.forEach(({ bid, job }) => {
    const nextMove = jobNextMove(job, 'provider', {
      otherName: names[job.requester_id],
      paymentMethod: bid.payment_method,
      paymentMarkedSentAt: bid.payment_marked_sent_at,
    })
    if (nextMove?.needsAction) {
      items.push({
        id: `next-provider-job-${job.id}`,
        entityType: 'job',
        entityId: job.id,
        viewerRole: 'provider',
        title: job.title,
        item: { ...job, _viewerRole: 'provider' },
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
