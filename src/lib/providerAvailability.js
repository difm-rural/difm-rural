export const PROVIDER_AVAILABILITY_OPTIONS = [
  {
    value: 'available_now',
    label: 'Available now',
    shortLabel: 'Available now',
    description: 'Ready to hear about suitable work now.',
    icon: 'flash-outline',
  },
  {
    value: 'available_this_week',
    label: 'Available this week',
    shortLabel: 'Available this week',
    description: 'Open to work during the current week.',
    icon: 'calendar-outline',
  },
  {
    value: 'limited',
    label: 'Limited availability',
    shortLabel: 'Limited availability',
    description: 'Some capacity, but timing may be restricted.',
    icon: 'time-outline',
  },
  {
    value: 'unavailable_until',
    label: 'Unavailable until…',
    shortLabel: 'Unavailable',
    description: 'Pause matching until a date you choose.',
    icon: 'pause-circle-outline',
  },
]

function asDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function availabilityDisplay(status, until, updatedAt, now = new Date()) {
  const updated = asDate(updatedAt)
  const unavailableUntil = typeof until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(until)
    ? asDate(`${until}T23:59:59`)
    : asDate(until)
  const ageDays = updated ? (now.getTime() - updated.getTime()) / 86400000 : Infinity

  if (status === 'available_now' && ageDays <= 7) {
    return { label: 'Available now', tone: 'positive', active: true }
  }
  if (status === 'available_this_week' && updated) {
    const expires = new Date(updated)
    expires.setHours(0, 0, 0, 0)
    expires.setDate(expires.getDate() + (8 - (expires.getDay() || 7)))
    if (now < expires) return { label: 'Available this week', tone: 'positive', active: true }
  }
  if (status === 'limited' && ageDays <= 14) {
    return { label: 'Limited availability', tone: 'limited', active: true }
  }
  if (status === 'unavailable_until' && unavailableUntil && now <= unavailableUntil) {
    return {
      label: `Unavailable until ${unavailableUntil.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}`,
      tone: 'muted',
      active: false,
    }
  }
  return { label: 'Availability not updated', tone: 'muted', active: false, stale: true }
}
