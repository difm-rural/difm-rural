import {ESTIMATED_TIMING_NOTE, listingAvailability, type ListingAvailability} from './listingAvailability'

export function listingAvailabilityDetail(listing: ListingAvailability) {
  const summary = listingAvailability(listing)
  if (!summary.enabled) return null
  const message = summary.message?.trim() || ''
  if (!summary.visibleStatus && !summary.lead && !message && !summary.updated) return null

  const estimate = listing.lead_time_type === 'range_days'
    ? summary.estimate.replace(/^(\d+) to (\d+) days$/, '$1\u2013$2 days')
    : summary.estimate
  const hasTiming = !!estimate && listing.lead_time_type !== 'contact_provider'
  const tone = summary.paused ? 'paused' : listing.availability_status === 'limited' ? 'limited' : 'accepting'
  return {
    status: summary.visibleStatus,
    tone,
    leadLabel: hasTiming ? summary.leadLabel : '',
    lead: estimate || summary.lead,
    message,
    disclaimer: hasTiming ? ESTIMATED_TIMING_NOTE : '',
    updated: summary.updated,
  } as const
}
