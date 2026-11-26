import {formatDateLabel} from './formatting.js'
import {listingDateError, nzCalendarDay, nzToday} from './postingDates'
import {KIND_ENQUIRY_ONLY, type ListingKind} from './listingPricing'

export const LISTING_AVAILABILITY_STATUSES = {
  accepting_bookings: 'Accepting bookings',
  limited: 'Limited availability',
  paused: 'Temporarily paused',
} as const
// Customer-facing wording for enquiry-only listings (For sale, Lease), which never
// take bookings. Settings, stored values and discovery classification are unchanged.
export const ENQUIRY_AVAILABILITY_STATUSES = {
  accepting_bookings: 'Available',
  limited: 'Limited availability',
  paused: 'Temporarily unavailable',
} as const satisfies Record<keyof typeof LISTING_AVAILABILITY_STATUSES, string>
export const LEAD_TIME_LABEL = 'Estimated lead time'
export const ENQUIRY_LEAD_TIME_LABEL = 'Estimated availability'
export const availabilityEnquiryOnly = (listing: {kind?: string | null}) => KIND_ENQUIRY_ONLY.includes(listing.kind as ListingKind)

export const LEAD_TIME_OPTIONS = {
  not_specified: 'Not specified',
  same_day: 'Same day',
  next_day: 'Next day',
  fixed_days: 'Fixed number of days',
  range_days: 'Range of days',
  earliest_date: 'Earliest available date',
  contact_provider: 'Contact provider',
} as const

export const LISTING_AVAILABILITY_COLUMNS = 'availability_enabled,availability_status,lead_time_type,lead_time_min_days,lead_time_max_days,lead_time_date,availability_message,availability_updated_at'
export const AVAILABILITY_MESSAGE_LIMIT = 250
export const PAUSED_REQUEST_MESSAGE = 'This listing is temporarily paused for new requests. You can still contact the provider.'
export const ESTIMATED_TIMING_NOTE = 'Estimated timing only. Confirm the date with the provider.'
export const AVAILABILITY_OPT_IN_HELP = 'Show customers your current availability and estimated lead time, or temporarily stop taking new bookings.'
export const DISABLE_PAUSED_AVAILABILITY_MESSAGE = 'Saving with availability management off will allow new booking and quote requests again where the listing normally accepts them. Your saved settings will be kept.'
export const isPausedRequestError = (error: {code?: string} | null) => error?.code === 'P0A01'

export type ListingAvailability = {
  availability_enabled?: boolean | null
  availability_status?: keyof typeof LISTING_AVAILABILITY_STATUSES | null
  lead_time_type?: keyof typeof LEAD_TIME_OPTIONS | null
  lead_time_min_days?: number | null
  lead_time_max_days?: number | null
  lead_time_date?: string | null
  availability_message?: string | null
  availability_updated_at?: string | null
  availability?: string[] | null
  kind?: string | null
}

export function listingAvailabilityEnabled(listing: ListingAvailability) {
  return listing.availability_enabled ?? !!(listing.availability_updated_at ||
    (listing.availability_status && listing.availability_status !== 'accepting_bookings') ||
    (listing.lead_time_type && listing.lead_time_type !== 'not_specified') ||
    listing.availability_message?.trim())
}

export function listingBookingsPaused(listing: ListingAvailability) {
  return listingAvailabilityEnabled(listing) && listing.availability_status === 'paused'
}

export function availabilityDraft(listing: ListingAvailability) {
  const legacy = !listing.availability_updated_at && listing.lead_time_type !== 'earliest_date'
    ? nzCalendarDay(listing.availability?.[0]) : null
  const legacyDate = legacy && legacy >= nzToday() ? legacy : null
  return {
    status: listing.availability_status ?? 'accepting_bookings',
    type: listing.lead_time_type && listing.lead_time_type !== 'not_specified'
      ? listing.lead_time_type : legacyDate ? 'earliest_date' : 'not_specified',
    min: String(listing.lead_time_min_days ?? ''),
    max: String(listing.lead_time_max_days ?? ''),
    date: listing.lead_time_date ?? legacyDate ?? '',
    message: listing.availability_message ?? '',
  } as const
}

export function availabilityPatch(draft: ReturnType<typeof availabilityDraft>, listing: ListingAvailability) {
  const {status, type, min, max, date, message} = draft
  const wholeDays = (value: string) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 2147483647
  if ((type === 'fixed_days' || type === 'range_days') && !wholeDays(min)) throw new Error('Enter a positive whole number of days.')
  if (type === 'range_days' && (!wholeDays(max) || Number(max) <= Number(min))) {
    throw new Error('Enter a maximum greater than the minimum.')
  }
  if (type === 'earliest_date') {
    const problem = listingDateError(date, listing.lead_time_date)
    if (!date || problem) throw new Error(problem || 'Choose an earliest available date.')
  }
  if (Array.from(message).length > AVAILABILITY_MESSAGE_LIMIT) throw new Error('Keep the public message to 250 characters.')
  return {
    availability_status: status,
    lead_time_type: type,
    lead_time_min_days: type === 'fixed_days' || type === 'range_days' ? Number(min) : null,
    lead_time_max_days: type === 'range_days' ? Number(max) : null,
    lead_time_date: type === 'earliest_date' ? date : null,
    availability_message: message.trim() || null,
  }
}

export function listingAvailabilityEditPatch(enabled: boolean, draft: ReturnType<typeof availabilityDraft>, listing?: ListingAvailability | null) {
  const previouslyEnabled = !!listing && listingAvailabilityEnabled(listing)
  if (!enabled) return previouslyEnabled ? {availability_enabled: false} : {}
  const fields = availabilityPatch(draft, listing ?? {})
  if (!previouslyEnabled) return {...fields, availability_enabled: true}
  const initial = availabilityDraft(listing!)
  return (Object.keys(initial) as (keyof typeof initial)[]).some(key => draft[key] !== initial[key]) ? fields : {}
}

export function listingAvailability(listing: ListingAvailability) {
  const enabled = listingAvailabilityEnabled(listing)
  const paused = listingBookingsPaused(listing)
  const enquiry = availabilityEnquiryOnly(listing)
  const status = (enquiry ? ENQUIRY_AVAILABILITY_STATUSES : LISTING_AVAILABILITY_STATUSES)[listing.availability_status ?? 'accepting_bookings']
  const leadLabel = enquiry ? ENQUIRY_LEAD_TIME_LABEL : LEAD_TIME_LABEL
  const legacy = !enabled && listing.availability?.length
    ? listing.availability.map(formatDateLabel).join(', ') : ''
  let estimate = ''
  switch (enabled ? listing.lead_time_type : null) {
    case 'same_day': estimate = 'Same day'; break
    case 'next_day': estimate = 'Next day'; break
    case 'fixed_days': estimate = listing.lead_time_min_days === 1 ? '1 day' : `${listing.lead_time_min_days} days`; break
    case 'range_days': estimate = `${listing.lead_time_min_days} to ${listing.lead_time_max_days} days`; break
    case 'earliest_date': if (listing.lead_time_date) estimate = `From ${formatDateLabel(listing.lead_time_date)}`; break
    case 'contact_provider': estimate = 'Contact provider'; break
  }
  const lead = estimate ? `${leadLabel}: ${estimate}` : legacy ? `Available from ${legacy}` : ''
  const visibleStatus = enabled ? status : ''
  const updated = enabled && listing.availability_updated_at
    ? `Updated ${formatDateLabel(nzCalendarDay(listing.availability_updated_at) ?? '')}` : ''
  return {
    enabled, paused, status, visibleStatus, lead, leadLabel, estimate, updated, legacy,
    card: [visibleStatus, lead].filter(Boolean),
    message: enabled ? listing.availability_message : null,
  }
}
