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

// Today uses the next half hour, with the existing 15-minute buffer.
// Future days start at 9 am.
export function defaultStartForDate(suggestedDate, now = new Date()) {
  const picked = startOfDay(localDate(suggestedDate) || now)
  if (picked > startOfDay(now)) {
    picked.setHours(9)
    return picked
  }

  const next = new Date(now)
  next.setMinutes(Math.ceil(next.getMinutes() / 30) * 30, 0, 0)
  if (next.getTime() - now.getTime() <= 15 * 60 * 1000) {
    return new Date(next.getTime() + 30 * 60 * 1000)
  }
  return next
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
