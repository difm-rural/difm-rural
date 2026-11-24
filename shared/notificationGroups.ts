// Relative times and day groups for notification lists. Calendar days are
// counted in New Zealand time so "Today" means the member's today even when
// the page renders on a UTC server.
import { formatDate } from './formatting.js'

const NZ_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' })

// Whole NZ calendar days between `then` and `now` (0 = same day).
function nzDayDiff(then: Date, now: Date): number {
  const day = (d: Date) => Date.parse(NZ_DAY.format(d) + 'T00:00:00Z') / 86400000
  return day(now) - day(then)
}

function parse(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function relativeTime(createdAt: unknown, now: Date = new Date()): string {
  const then = parse(createdAt)
  if (!then) return ''
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const days = nzDayDiff(then, now)
  if (days <= 0) return `${Math.floor(mins / 60)}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return formatDate(then)
}

export type DayGroupLabel = 'Today' | 'Yesterday' | 'This week' | 'Earlier'
export type DayGroup<T> = { label: DayGroupLabel; items: T[] }

export function dayGroupLabel(createdAt: unknown, now: Date = new Date()): DayGroupLabel {
  const then = parse(createdAt)
  if (!then) return 'Earlier'
  const days = nzDayDiff(then, now)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'This week'
  return 'Earlier'
}

// Groups a newest-first list, keeping its order. Empty groups are left out.
export function groupByDay<T extends { created_at?: unknown }>(list: readonly T[], now: Date = new Date()): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of list) {
    const label = dayGroupLabel(item.created_at, now)
    const group = groups.find(g => g.label === label)
    if (group) group.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}
