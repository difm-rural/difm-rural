export function formatMoney(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return amount.toLocaleString('en-NZ', { style:'currency', currency:'NZD', currencyDisplay:'narrowSymbol', minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })
}
function dateValue(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value + 'T12:00:00Z')
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? { date, timeZone: 'UTC' } : null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : { date, timeZone: 'Pacific/Auckland' }
}
export function formatDate(value) {
  const parsed = dateValue(value)
  return parsed ? parsed.date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: parsed.timeZone }) : '—'
}
export function formatDateTime(value) {
  const parsed = dateValue(value)
  return parsed ? formatDate(value) + ', ' + parsed.date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: parsed.timeZone }) : '—'
}
export function formatWorkDate(value) {
  const parsed = dateValue(value)
  if (!parsed) return '—'
  const weekday = parsed.date.toLocaleDateString('en-NZ', { weekday: 'short', timeZone: parsed.timeZone })
  return weekday + ' ' + formatDate(value)
}
export function formatWorkDateTime(value) {
  const parsed = dateValue(value)
  if (!parsed) return '—'
  const parts = new Intl.DateTimeFormat('en-NZ', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: parsed.timeZone,
  }).formatToParts(parsed.date)
  const part = type => parts.find(p => p.type === type)?.value
  const period = part('dayPeriod').replace(/\./g, '').toLowerCase()
  return `${formatWorkDate(value)}, ${part('hour')}:${part('minute')} ${period}`
}
export function formatDateLabel(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? formatDate(value) : String(value??'')
}
// A distance in km for display: under 10 km keeps one decimal ("2.8 km");
// 10 km and over rounds to a whole number with thousands separators ("514 km").
export function formatDistance(km) {
  if (km === null || km === undefined || String(km).trim() === '') return '—'
  const n = Number(km)
  if (!Number.isFinite(n)) return '—'
  return (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-NZ')) + ' km'
}
