import { requireAdmin } from '@/lib/auth'

export type NamedMetric = { name: string; value: number }
export type CategoryCoverage = { name: string; openJobs: number; matchedJobs: number }
export type RegionSupply = { name: string; providers: number; available: number }

export type EngagementOverview = {
  funnel: NamedMetric[]
  timing: { medianHoursToFirstView: number | null; medianHoursToFirstOffer: number | null }
  retention: {
    repeatJobs: number; repeatRate: number; activeSavedInterests: number
    savedInterestUsers: number; savedInterestMatches: number; instantInterests: number
    dailyInterests: number; pausedInterests: number
  }
  listing: {
    openJobs: number; noViews48h: number; viewedNoOffers48h: number
    zeroMatches: number; missingPhotos: number; openBudgets: number; shortDescriptions: number
  }
  providers: {
    total: number; available: number; staleAvailability: number; alertOptIn: number
    zeroMatchOpenJobs: number; availability: NamedMetric[]; alertModes: NamedMetric[]
    categoryCoverage: CategoryCoverage[]; regionSupply: RegionSupply[]
  }
  coordination: {
    activeWork: number; scheduledWork: number; unscheduledWork: number; upcomingToday: number
    upcomingWeek: number; overdue: number; lateNotices: number; completionPrompts: number
  }
  delivery: { failedEmails: number; pendingEmails: number; emailStatuses: NamedMetric[] }
}

export type OperationRow = {
  queue_id: string
  record_type: 'job' | 'booking'
  record_id: string
  issue_code: 'no_views' | 'views_no_offers' | 'zero_matches' | 'unscheduled' | 'overdue'
  severity: 'high' | 'medium'
  title: string
  category: string | null
  location: string | null
  status: string
  age_hours: number
  provider_views: number
  matching_providers: number
  offers: number
  expected_complete_at: string | null
  created_at: string
}

const EMPTY_OVERVIEW: EngagementOverview = {
  funnel: [],
  timing: { medianHoursToFirstView: null, medianHoursToFirstOffer: null },
  retention: {
    repeatJobs: 0, repeatRate: 0, activeSavedInterests: 0, savedInterestUsers: 0,
    savedInterestMatches: 0, instantInterests: 0, dailyInterests: 0, pausedInterests: 0,
  },
  listing: {
    openJobs: 0, noViews48h: 0, viewedNoOffers48h: 0, zeroMatches: 0,
    missingPhotos: 0, openBudgets: 0, shortDescriptions: 0,
  },
  providers: {
    total: 0, available: 0, staleAvailability: 0, alertOptIn: 0,
    zeroMatchOpenJobs: 0, availability: [], alertModes: [], categoryCoverage: [], regionSupply: [],
  },
  coordination: {
    activeWork: 0, scheduledWork: 0, unscheduledWork: 0, upcomingToday: 0,
    upcomingWeek: 0, overdue: 0, lateNotices: 0, completionPrompts: 0,
  },
  delivery: { failedEmails: 0, pendingEmails: 0, emailStatuses: [] },
}

export async function getEngagementOverview(days: number) {
  const { supabase, profile } = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_engagement_overview', { p_days: days })
  if (error) throw new Error(`Unable to load engagement reporting: ${error.message}`)
  return {
    adminName: profile.display_name || profile.full_name || 'Admin',
    overview: (data || EMPTY_OVERVIEW) as EngagementOverview,
  }
}

export async function getOperationsData(days: number) {
  const { supabase, profile } = await requireAdmin()
  const [overviewResult, queueResult] = await Promise.all([
    supabase.rpc('admin_engagement_overview', { p_days: days }),
    supabase.rpc('admin_operations_queue', { p_limit: 250 }),
  ])
  if (overviewResult.error) throw new Error(`Unable to load operations reporting: ${overviewResult.error.message}`)
  if (queueResult.error) throw new Error(`Unable to load operations queue: ${queueResult.error.message}`)
  return {
    adminName: profile.display_name || profile.full_name || 'Admin',
    overview: (overviewResult.data || EMPTY_OVERVIEW) as EngagementOverview,
    queue: (queueResult.data || []) as OperationRow[],
  }
}
