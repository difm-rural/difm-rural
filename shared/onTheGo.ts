// "On the go" on Home: everything in flight, by name, with whose turn it is.
// Pure and UI-free — shared by the mobile app and provider-web.
//
// Order: items needing the viewer's action first, then the most recently
// updated. There is no updated_at column on jobs / bids / bookings, so an
// item's "updated" time is the latest of the timestamps it has (created,
// accepted, quote sent, payment details sent / sorted, …).

export const ON_THE_GO_LIMIT = 3

export type OnTheGoRankable = {
  needsAction: boolean
  // Any timestamps that mark activity on the item; the latest one wins.
  updatedAt?: unknown
}

function time(value: unknown): number {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime()
  if (typeof value !== 'string' || !value.trim()) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

// The latest of one timestamp or a list of them (missing / invalid ones ignored).
export function latestTime(values: unknown): number {
  const list = Array.isArray(values) ? values : [values]
  return list.reduce((latest: number, value) => Math.max(latest, time(value)), 0)
}

// Sort and cap. Returns the rows to show, how many there are in total, and how
// many were left out (for "View all ›"). Ties keep their original order.
export function rankOnTheGo<T extends OnTheGoRankable>(items: T[], limit = ON_THE_GO_LIMIT): { shown: T[]; total: number; more: number } {
  const ranked = items
    .map((item, index) => ({ item, index, at: latestTime(item.updatedAt) }))
    .sort((a, b) =>
      Number(b.item.needsAction) - Number(a.item.needsAction)
      || b.at - a.at
      || a.index - b.index)
    .map(row => row.item)
  const shown = ranked.slice(0, Math.max(0, limit))
  return { shown, total: ranked.length, more: ranked.length - shown.length }
}
