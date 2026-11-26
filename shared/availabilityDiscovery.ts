// Release 2.1 – Availability Discovery.
// Pure helpers shared by the mobile app, provider web and public web so the
// availability filter and "Shortest lead time" sort behave identically on every
// client. They read only the public Release 1.2 availability columns already
// exposed by `services_public`, and never change what a listing displays.
import {availabilityEnquiryOnly, listingAvailabilityEnabled, listingBookingsPaused, type ListingAvailability} from './listingAvailability'
import {nzCalendarDay, nzToday} from './postingDates'

export type AvailabilityFilter = '' | 'accepting' | 'lead_time'
export type DiscoverySort = 'default' | 'lead_time'

// [value, label]. '' is the default ("All listings"), matching HELP_FILTERS.
export const AVAILABILITY_FILTERS = [
  ['', 'All listings'],
  ['accepting', 'Accepting bookings'],
  ['lead_time', 'Published lead time'],
] as const satisfies readonly (readonly [AvailabilityFilter, string])[]
export const LEAD_TIME_SORT = 'lead_time' as const
export const LEAD_TIME_SORT_LABEL = 'Shortest lead time'
export const LEAD_TIME_SORT_NOTE = 'Lead times are estimates from each provider, not confirmed booking dates.'

export function availabilityFilterValue(value: unknown): AvailabilityFilter {
  return value === 'accepting' || value === 'lead_time' ? value : ''
}
export function availabilityFilterLabel(value: AvailabilityFilter) {
  return AVAILABILITY_FILTERS.find(([key]) => key === value)?.[1] ?? 'All listings'
}

export type DiscoverableListing = ListingAvailability & {kind?: string | null}

// For sale and lease listings take enquiries only; they never accept bookings.
export const listingEnquiryOnly = availabilityEnquiryOnly

const DAY = 86400000
function calendarDays(from: string, to: string) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY)
}
const wholeDays = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null

// Lead time normalised to days, for comparison only. null = unknown.
// Display text is unchanged and comes from listingAvailability().
export function leadTimeDays(listing: ListingAvailability, today: string = nzToday()): number | null {
  if (!listingAvailabilityEnabled(listing)) return null
  switch (listing.lead_time_type) {
    case 'same_day': return 0
    case 'next_day': return 1
    case 'fixed_days': return wholeDays(listing.lead_time_min_days)
    case 'range_days': return wholeDays(listing.lead_time_max_days) ?? wholeDays(listing.lead_time_min_days)
    case 'earliest_date': {
      const day = nzCalendarDay(listing.lead_time_date)
      // Past dates rank as "available now" for sorting only.
      return day ? Math.max(0, calendarDays(today, day)) : null
    }
    default: return null // contact_provider, not_specified, missing or unrecognised
  }
}

export type DiscoveryGroup = 'accepting' | 'paused' | 'enquiry'
export function listingDiscovery(listing: DiscoverableListing, today: string = nzToday()) {
  const enquiry = listingEnquiryOnly(listing)
  const group: DiscoveryGroup = enquiry ? 'enquiry' : listingBookingsPaused(listing) ? 'paused' : 'accepting'
  const days = group === 'accepting' ? leadTimeDays(listing, today) : null
  return {group, days, enabled: listingAvailabilityEnabled(listing)}
}

export function matchesAvailabilityFilter(listing: DiscoverableListing, filter: AvailabilityFilter | string, today: string = nzToday()) {
  if (!filter) return true
  const {group, days, enabled} = listingDiscovery(listing, today)
  if (group !== 'accepting') return false
  return filter === 'accepting' ? true : filter === 'lead_time' ? enabled && days !== null : true
}

// Sort rank: (0) accepting bookings with a comparable estimate, by days;
// (1) accepting bookings without one; (2) temporarily paused; (3) enquiry-only.
export function leadTimeRank(listing: DiscoverableListing, today: string = nzToday()): [number, number] {
  const {group, days} = listingDiscovery(listing, today)
  if (group === 'enquiry') return [3, 0]
  if (group === 'paused') return [2, 0]
  return days === null ? [1, 0] : [0, days]
}

// Stable: rows that rank equally keep the order they arrived in, so callers
// pass rows already in the existing default order (newest or nearest).
export function sortByLeadTime<T extends DiscoverableListing>(rows: T[], today: string = nzToday()): T[] {
  return rows
    .map((row, index) => ({row, index, rank: leadTimeRank(row, today)}))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map(({row}) => row)
}

// Apply the availability filter, then the sort, to an already-filtered set.
export function applyAvailabilityDiscovery<T extends DiscoverableListing>(rows: T[], filter: AvailabilityFilter | string, sort: string, today: string = nzToday()): T[] {
  const matching = filter ? rows.filter(row => matchesAvailabilityFilter(row, filter, today)) : rows
  return sort === LEAD_TIME_SORT ? sortByLeadTime(matching, today) : matching
}
