// Completed jobs and bookings the viewer hasn't reviewed yet, for Home. Shared
// by the mobile app and provider-web; takes any supabase-js client.
//
// There is no completed_at column, so "recent" is measured from when the work
// was posted / requested (REVIEW_PROMPT_DAYS). Review rows are publicly
// readable; jobs are read only as the requester (own rows) or through the
// viewer's own accepted bids, so no masked job fields are exposed.
import { reviewNextMove, REVIEW_PROMPT_DAYS, type NextMove } from './nextMove.ts'

export type ReviewPrompt = {
  key: string
  kind: 'job' | 'booking'
  id: string
  title: string
  viewerRole: 'requester' | 'provider'
  otherId: string | null
  otherName: string | null
  next: NextMove
  updatedAt: unknown[]
}

type Row = Record<string, any>
type Result = { data: Row[] | null; error: unknown }

export async function loadReviewPrompts(client: any, userId: string, now = new Date()): Promise<ReviewPrompt[]> {
  if (!userId) return []
  const since = new Date(now.getTime() - REVIEW_PROMPT_DAYS * 864e5).toISOString()
  const [ownJobs, doneBids, bookings]: Result[] = await Promise.all([
    client.from('jobs').select('id,title,created_at,accepted_at').eq('requester_id', userId).eq('status', 'completed').gte('created_at', since),
    // Embedding base jobs is allowed here: filtered to the viewer's own accepted bids.
    client.from('bids').select('job_id,job:jobs!inner(id,title,status,requester_id,created_at,accepted_at)')
      .eq('provider_id', userId).eq('status', 'accepted').eq('job.status', 'completed').gte('job.created_at', since),
    client.from('bookings').select('id,requester_id,provider_id,created_at,quote_accepted_at,service:services_public(title)')
      .or('requester_id.eq.' + userId + ',provider_id.eq.' + userId).eq('status', 'completed').gte('created_at', since),
  ])
  if (ownJobs.error || doneBids.error || bookings.error) return []

  const ownIds = (ownJobs.data || []).map(job => job.id)
  const providedJobs = (doneBids.data || []).map(bid => (Array.isArray(bid.job) ? bid.job[0] : bid.job)).filter(Boolean)
  const jobIds = [...new Set([...ownIds, ...providedJobs.map(job => job.id)])]
  const bookingIds = (bookings.data || []).map(booking => booking.id)
  const [winners, reviewedJobs, reviewedBookings]: Result[] = await Promise.all([
    ownIds.length ? client.from('bids').select('job_id,provider_id').in('job_id', ownIds).eq('status', 'accepted') : { data: [], error: null },
    jobIds.length ? client.from('reviews').select('job_id,reviewer_role').eq('reviewer_id', userId).in('job_id', jobIds) : { data: [], error: null },
    bookingIds.length ? client.from('reviews').select('booking_id,reviewer_role').eq('reviewer_id', userId).in('booking_id', bookingIds) : { data: [], error: null },
  ])
  if (winners.error || reviewedJobs.error || reviewedBookings.error) return []
  const done = new Set([
    ...(reviewedJobs.data || []).map(r => 'job:' + r.job_id + ':' + r.reviewer_role),
    ...(reviewedBookings.data || []).map(r => 'booking:' + r.booking_id + ':' + r.reviewer_role),
  ])
  const winner = new Map((winners.data || []).map(bid => [bid.job_id, bid.provider_id as string]))

  const rows: Omit<ReviewPrompt, 'otherName' | 'next'>[] = []
  for (const job of ownJobs.data || []) rows.push({ key: 'review:job:' + job.id, kind: 'job', id: job.id, title: job.title || 'Job', viewerRole: 'requester', otherId: winner.get(job.id) || null, updatedAt: [job.created_at, job.accepted_at] })
  for (const job of providedJobs) rows.push({ key: 'review:job:' + job.id + ':provider', kind: 'job', id: job.id, title: job.title || 'Job', viewerRole: 'provider', otherId: job.requester_id || null, updatedAt: [job.created_at, job.accepted_at] })
  for (const booking of bookings.data || []) {
    const providing = booking.provider_id === userId
    const service = Array.isArray(booking.service) ? booking.service[0] : booking.service
    rows.push({ key: 'review:booking:' + booking.id, kind: 'booking', id: booking.id, title: service?.title || 'Booking', viewerRole: providing ? 'provider' : 'requester', otherId: (providing ? booking.requester_id : booking.provider_id) || null, updatedAt: [booking.created_at, booking.quote_accepted_at] })
  }
  const open = rows.filter(row => !done.has(row.kind + ':' + row.id + ':' + row.viewerRole))
  const personIds = [...new Set(open.map(row => row.otherId).filter(Boolean))]
  const people: Result = personIds.length ? await client.from('profiles_public').select('id,full_name').in('id', personIds) : { data: [], error: null }
  const names = new Map((people.data || []).map(person => [person.id, person.full_name as string | null]))
  return open.map(row => {
    const otherName = row.otherId ? names.get(row.otherId) || null : null
    return { ...row, otherName, next: reviewNextMove(otherName, row.viewerRole) }
  })
}
