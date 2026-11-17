// The date a requester asked for a job, and how the provider's chosen day
// relates to it. Pure and UI-free — shared by the mobile app and provider-web
// (confirm job, change time, offer form, job details). The wording of
// arrivalDayNote() mirrors public.job_requested_day_note() in the database so
// previews match the message confirm_job posts.
//
// Days are ISO 'YYYY-MM-DD' calendar days throughout; callers pass `today`.
import { editorScheduleType, nzCalendarDay, type JobSchedule } from './postingDates'

// from/to are set (and from <= to) for 'specific' and 'range', null otherwise.
export type RequestedDate = { kind: 'specific' | 'range' | 'asap' | 'flexible'; from: string | null; to: string | null }

export type DayChip = { day: string; label: string; kind: 'requested' | 'range' | 'offer' }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MAX_RANGE_CHIPS = 7

// Calendar maths in UTC so a day never shifts with the device timezone.
const utc = (day: string) => new Date(day + 'T12:00:00Z')
const dayOfMonth = (day: string) => utc(day).getUTCDate()
const monthName = (day: string) => MONTHS[utc(day).getUTCMonth()]
const weekday = (day: string) => WEEKDAYS[utc(day).getUTCDay()]

export function addDays(day: string, count: number): string {
  const date = utc(day)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

// "Sat 15" — the short chip form.
export function shortDayLabel(day: string): string { return `${weekday(day)} ${dayOfMonth(day)}` }
// "Sat 15 Nov"
export function dayLabel(day: string): string { return `${shortDayLabel(day)} ${monthName(day)}` }
// "15–18 Nov", or "28 Nov – 2 Dec" across months.
export function rangeLabel(from: string, to: string): string {
  if (from === to) return dayLabel(from)
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${dayOfMonth(from)}–${dayOfMonth(to)} ${monthName(to)}`
    : `${dayOfMonth(from)} ${monthName(from)} – ${dayOfMonth(to)} ${monthName(to)}`
}

// What the requester asked for. A specific/range job with unusable dates falls
// back to flexible rather than guessing.
export function requestedDate(job: JobSchedule | null | undefined): RequestedDate {
  const type = editorScheduleType(job || {})
  if (type === 'specific') {
    const day = nzCalendarDay(job?.scheduled_date)
    if (day) return { kind: 'specific', from: day, to: day }
  }
  if (type === 'range') {
    const from = nzCalendarDay(job?.date_from), to = nzCalendarDay(job?.date_to)
    if (from && to && from <= to) return { kind: 'range', from, to }
  }
  return { kind: type === 'asap' ? 'asap' : 'flexible', from: null, to: null }
}

export function requestedPassed(job: JobSchedule | null | undefined, today: string): boolean {
  const requested = requestedDate(job)
  return requested.to !== null && requested.to < today
}

// "Sat 15 Nov" | "15–18 Nov" | "Flexible" | "As soon as possible", with
// " (passed)" once the whole requested date/range is behind us.
export function requestedLabel(job: JobSchedule | null | undefined, today?: string): string {
  const requested = requestedDate(job)
  if (requested.kind === 'asap') return 'As soon as possible'
  if (requested.from === null || requested.to === null) return 'Flexible'
  const label = rangeLabel(requested.from, requested.to) // a single day reads "Sat 15 Nov"
  return today && requested.to < today ? `${label} (passed)` : label
}

// The day chips for choosing an arrival day, driven by what was requested:
//   specific (today or later) → "Use requested date · Sat 15", pre-selected; the
//                               usual quick picks follow.
//   range                     → the days in the range from today on (max 7);
//                               preselect only a single-day request.
//   flexible / asap / passed  → no special chips; the usual quick picks.
//   offer later than asked    → an extra "You offered · Mon 17", not pre-selected.
export function arrivalDayChoices(
  job: JobSchedule | null | undefined,
  { today, offerDay }: { today: string; offerDay?: unknown },
): { requestedLabel: string; chips: DayChip[]; preselect: string | null; quickPicks: boolean } {
  const requested = requestedDate(job)
  const chips: DayChip[] = []
  let preselect: string | null = null
  let quickPicks = true

  if (requested.kind === 'specific' && requested.from !== null && requested.from >= today) {
    chips.push({ day: requested.from, label: `Use requested date · ${shortDayLabel(requested.from)}`, kind: 'requested' })
    preselect = requested.from
  } else if (requested.kind === 'range' && requested.from !== null && requested.to !== null && requested.to >= today) {
    let day = requested.from < today ? today : requested.from
    for (let count = 0; day <= requested.to && count < MAX_RANGE_CHIPS; count += 1, day = addDays(day, 1)) {
      chips.push({ day, label: shortDayLabel(day), kind: 'range' })
    }
    if (requested.from === requested.to) preselect = requested.from
    quickPicks = false
  }

  const offer = nzCalendarDay(offerDay)
  if (offer && offer >= today && (requested.to === null || offer > requested.to) && !chips.some(chip => chip.day === offer)) {
    chips.push({ day: offer, label: `You offered · ${shortDayLabel(offer)}`, kind: 'offer' })
  }

  return { requestedLabel: requestedLabel(job, today), chips, preselect, quickPicks }
}

// How a chosen arrival day relates to the request.
export function arrivalDayMatch(job: JobSchedule | null | undefined, day: string | null): 'match' | 'mismatch' | 'none' {
  const requested = requestedDate(job)
  if (!day || requested.from === null || requested.to === null) return 'none'
  return day >= requested.from && day <= requested.to ? 'match' : 'mismatch'
}

// The extra wording confirm_job adds to its message:
//   match    → suffix " (the day you asked for)" after the date
//   mismatch → line "Note: that's Sat 16 Nov, not the Fri 15 Nov you asked for."
//   flexible → nothing
export function arrivalDayNote(job: JobSchedule | null | undefined, day: string | null): { suffix: string; line: string } {
  const match = arrivalDayMatch(job, day)
  if (match === 'match') return { suffix: ' (the day you asked for)', line: '' }
  if (match === 'mismatch') {
    const requested = requestedDate(job)
    return { suffix: '', line: `Note: that's ${dayLabel(day!)}, not the ${rangeLabel(requested.from!, requested.to!)} you asked for.` }
  }
  return { suffix: '', line: '' }
}

// Default "Available from" on a new offer: the requested (first) date when it
// is today or later; otherwise leave it for the provider to choose.
export function offerDefaultDay(job: JobSchedule | null | undefined, today: string): string | null {
  const requested = requestedDate(job)
  return requested.from !== null && requested.from >= today ? requested.from : null
}
