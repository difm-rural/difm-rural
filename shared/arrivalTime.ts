import { nzCalendarDay } from './postingDates'

const clock = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function arrivalInputValue(date: Date): string {
  const day = nzCalendarDay(date)
  return day ? day + 'T' + clock.format(date) : ''
}

// Convert an Auckland wall-clock entry independent of the browser timezone.
// Check offsets on either side of a DST transition. For a repeated time,
// prefer the earlier instant unless an unchanged saved instant is available.
export function parseArrivalInput(input: string, saved?: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(input) || !nzCalendarDay(input.slice(0, 10))) return null
  if (saved && arrivalInputValue(new Date(saved)) === input) return new Date(saved)
  const wall = Date.parse(input + 'Z')
  for (const sample of [wall - 86400000, wall + 86400000]) {
    const offset = Date.parse(arrivalInputValue(new Date(sample)) + 'Z') - sample
    const instant = new Date(wall - offset)
    if (arrivalInputValue(instant) === input) return instant
  }
  return null
}
