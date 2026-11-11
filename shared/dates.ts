// Parse a human-entered date into an ISO 'YYYY-MM-DD' string, or null if it
// isn't a real date. Shared by the app and provider-web so the DateInput
// fallback and the server validate the same way.
//
// Accepts:
//   ISO                 2026-11-11
//   day month-name year "11 Nov 2026", "11 November 2026" (case-insensitive,
//                       optional comma: "11 Nov, 2026")
//   numeric             "11/11/2026", "11-11-2026"  — always DAY/MONTH/YEAR (NZ)
//   two-digit years     → 20xx
// Rejects impossible dates (e.g. 31 Feb) and anything else.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

// Build an ISO date only if (y, m, d) is a real calendar date. A UTC round-trip
// rejects overflow like 31 Feb (which would roll into March).
function toIso(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`
}

const toYear = (y: number) => (y < 100 ? 2000 + y : y)

// Format a Date as a LOCAL 'YYYY-MM-DD' — the calendar day as it reads on the
// device. Use this for date-only values (a bid's available_from, a booking's
// scheduled_date) instead of `d.toISOString().split('T')[0]`, which converts to
// UTC and shifts the day backwards for zones east of UTC (NZ is UTC+12/13, so a
// day picked at local midnight becomes the previous day). Returns null for a
// missing or Invalid Date, so callers never hit `toISOString()`'s RangeError.
export function toLocalIsoDate(d: Date | null | undefined): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseNzDate(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!s) return null

  // ISO 2026-11-11
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]))

  // DAY/MONTH/YEAR or DAY-MONTH-YEAR (NZ order), 2- or 4-digit year
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s)
  if (m) return toIso(toYear(Number(m[3])), Number(m[2]), Number(m[1]))

  // "11 Nov 2026" / "11 November 2026", optional comma, case-insensitive
  m = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{2}|\d{4})$/.exec(s)
  if (m) {
    const month = MONTHS[m[2].toLowerCase()]
    if (!month) return null
    return toIso(toYear(Number(m[3])), month, Number(m[1]))
  }

  return null
}
