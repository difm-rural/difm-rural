import { requireAdmin } from '@/lib/auth'

type Job = { id: string; title: string; status: string; category: string | null; location_name: string | null; created_at: string }
type Snapshot = { snapshot_date: string; open_jobs: number; completed_jobs: number; active_services: number }

const ACTIVE_BOOKINGS = new Set(['pending', 'quote_sent', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested'])

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>()
  items.forEach(item => counts.set(key(item), (counts.get(key(item)) || 0) + 1))
  return Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

export async function getDashboardData(days: number) {
  const { supabase, profile } = await requireAdmin()
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - days + 1)
  const cutoff = start.toISOString()

  const [
    jobsResult, servicesResult, bookingsResult, snapshotsResult,
    completionsResult, usersResult, newUsersResult, bidsResult,
    campaignsResult, deliveriesResult,
  ] = await Promise.all([
    supabase.from('jobs').select('id, title, status, category, location_name, created_at').order('created_at', { ascending: false }),
    supabase.from('services').select('id, title, is_active, category, created_at'),
    supabase.from('bookings').select('id, status, created_at'),
    supabase.from('marketplace_daily_snapshots').select('snapshot_date, open_jobs, completed_jobs, active_services').gte('snapshot_date', dayKey(start)).order('snapshot_date'),
    supabase.from('job_status_history').select('job_id, changed_at, from_status').eq('to_status', 'completed').not('from_status', 'is', null).gte('changed_at', cutoff),
    supabase.from('profiles_public').select('id', { count: 'exact', head: true }),
    supabase.from('profiles_public').select('id', { count: 'exact', head: true }).gte('created_at', cutoff),
    supabase.from('bids').select('id', { count: 'exact', head: true }).gte('created_at', cutoff),
    supabase.from('seasonal_campaigns').select('id, is_active, starts_on, ends_on'),
    supabase.from('seasonal_campaign_deliveries').select('campaign_id, first_impression_at, dismissed_at, actioned_at, email_sent_at').gte('created_at', cutoff),
  ])

  const jobs = (jobsResult.data || []) as Job[]
  const services = servicesResult.data || []
  const bookings = bookingsResult.data || []
  const snapshots = (snapshotsResult.data || []) as Snapshot[]
  const campaigns = campaignsResult.data || []
  const deliveries = deliveriesResult.data || []
  const today = dayKey(new Date())

  const jobCreated = new Map<string, number>()
  jobs.forEach(job => {
    const key = job.created_at.slice(0, 10)
    if (job.created_at >= cutoff) jobCreated.set(key, (jobCreated.get(key) || 0) + 1)
  })
  const snapshotMap = new Map(snapshots.map(item => [item.snapshot_date, item]))
  const timeline = Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    const key = dayKey(date)
    const snapshot = snapshotMap.get(key)
    return {
      date: key,
      label: date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' }),
      posted: jobCreated.get(key) || 0,
      open: snapshot?.open_jobs ?? null,
    }
  })

  const createdById = new Map(jobs.map(job => [job.id, new Date(job.created_at).getTime()]))
  const lifecycleHours = (completionsResult.data || []).flatMap(event => {
    const created = createdById.get(event.job_id)
    if (!created) return []
    const hours = (new Date(event.changed_at).getTime() - created) / 3_600_000
    return hours >= 0 ? [hours] : []
  })
  const averageLifecycleHours = lifecycleHours.length
    ? lifecycleHours.reduce((sum, value) => sum + value, 0) / lifecycleHours.length
    : null

  return {
    adminName: profile.display_name || profile.full_name || 'Admin',
    days,
    kpis: {
      users: usersResult.count || 0,
      newUsers: newUsersResult.count || 0,
      openJobs: jobs.filter(job => job.status === 'open').length,
      jobsPosted: jobs.filter(job => job.created_at >= cutoff).length,
      completedJobs: jobs.filter(job => job.status === 'completed').length,
      activeServices: services.filter(service => service.is_active).length,
      activeBookings: bookings.filter(booking => ACTIVE_BOOKINGS.has(booking.status)).length,
      offers: bidsResult.count || 0,
      averageLifecycleHours,
    },
    timeline,
    jobStatuses: countBy(jobs, job => job.status),
    serviceStatuses: [
      { name: 'Active', value: services.filter(service => service.is_active).length },
      { name: 'Paused', value: services.filter(service => !service.is_active).length },
    ],
    bookingStatuses: countBy(bookings, booking => booking.status),
    categories: countBy(jobs.filter(job => job.category), job => job.category || 'Other').slice(0, 8),
    recentJobs: jobs.slice(0, 8),
    campaign: {
      live: campaigns.filter(campaign => campaign.is_active && campaign.starts_on <= today && campaign.ends_on >= today).length,
      scheduled: campaigns.filter(campaign => campaign.is_active && campaign.starts_on > today).length,
      impressions: deliveries.filter(delivery => delivery.first_impression_at).length,
      actions: deliveries.filter(delivery => delivery.actioned_at).length,
      dismissed: deliveries.filter(delivery => delivery.dismissed_at).length,
      emails: deliveries.filter(delivery => delivery.email_sent_at).length,
    },
  }
}
