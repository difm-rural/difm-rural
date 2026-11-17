import { toLocalIsoDate } from '../../shared/dates'
import { arrivalInputValue, parseArrivalInput } from '../../shared/arrivalTime'

// Native controls use Date objects in the device timezone. These adapters
// keep the displayed clock fields separate from the saved Auckland instant.
export function arrivalPickerDate(instant) {
  return localDate(arrivalInputValue(instant))
}

export function arrivalPickerInstant(value, saved) {
  const time = [value.getHours(), value.getMinutes()].map(part => String(part).padStart(2, '0')).join(':')
  return parseArrivalInput(toLocalIsoDate(value) + 'T' + time, saved)
}

function startOfDay(date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return day
}

export function localDate(value) {
  if (!value) return null
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Seed native time pickers from the next buffered half hour. New arrival
// forms display no chosen time until the provider confirms a selection.
export function defaultStartForDate(suggestedDate, now = new Date()) {
  const picked = startOfDay(localDate(suggestedDate) || now)
  const next = new Date(now)
  next.setMinutes(Math.ceil(next.getMinutes() / 30) * 30, 0, 0)
  if (next.getTime() - now.getTime() <= 15 * 60 * 1000) next.setMinutes(next.getMinutes() + 30)
  if (picked > startOfDay(now)) {
    picked.setHours(next.getHours(), next.getMinutes())
    return picked
  }
  return next
}

export function arrivalPickerSeed(day) {
  return startForDay(day, { now: arrivalPickerDate(new Date()) })
}

export function quickPickDays({ now = new Date(), minimumDate = now, arrival = false } = {}) {
  const firstDay = startOfDay(now)
  const minimumDay = startOfDay(minimumDate)
  const days = []
  for (let offset = 0; offset <= 5; offset += 1) {
    const date = new Date(firstDay)
    date.setDate(date.getDate() + offset)
    if (date < minimumDay) continue
    if (offset === 0 && arrival && startOfDay(defaultStartForDate(date, now)) > firstDay) continue
    const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow'
      : `${date.toLocaleDateString('en-NZ', { weekday: 'short' })} ${date.getDate()}`
    days.push({ date, label })
  }
  return days
}

// Quick arrival times: 7 am – 4 pm on the hour.
export const QUICK_PICK_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]

function hourLabel(hour) {
  return `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`
}

// Time chips for the chosen day. On today, times that have already passed (or
// are happening right now) are hidden; any other day shows them all. A day
// before today has none.
export function quickPickTimes({ day, now = new Date() } = {}) {
  const chosen = startOfDay(localDate(day) || now)
  const today = startOfDay(now)
  if (chosen < today) return []
  return QUICK_PICK_HOURS
    .map(hour => {
      const date = new Date(chosen)
      date.setHours(hour, 0, 0, 0)
      return { hour, label: hourLabel(hour), date }
    })
    .filter(({ date }) => date.getTime() > now.getTime())
}

// The chip matching a start time exactly (on the hour), or null — in which case
// the time shows as the "Other time" value (e.g. today's next-half-hour default).
export function selectedQuickPickHour(start, now = new Date()) {
  if (!start || start.getMinutes() !== 0) return null
  return quickPickTimes({ day: start, now }).find(({ date }) => date.getTime() === start.getTime())?.hour ?? null
}

// Moving to another day: keep a time the provider has explicitly chosen when it
// is still ahead of now on that day; otherwise use a picker seed.
export function startForDay(day, { keepTimeFrom = null, now = new Date() } = {}) {
  if (keepTimeFrom) {
    const kept = startOfDay(localDate(day) || now)
    kept.setHours(keepTimeFrom.getHours(), keepTimeFrom.getMinutes(), 0, 0)
    if (kept.getTime() > now.getTime()) return kept
  }
  const seed = defaultStartForDate(day, now)
  const selected = localDate(day)
  if (!selected) return seed
  selected.setHours(seed.getHours(), seed.getMinutes(), 0, 0)
  return selected
}
