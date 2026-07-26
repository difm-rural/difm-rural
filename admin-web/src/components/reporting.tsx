import Link from 'next/link'

export function RangePicker({ base, days }: { base: string; days: number }) {
  return (
    <nav className="range-picker" aria-label="Reporting date range">
      {[7, 30, 90].map(range => (
        <Link key={range} href={`${base}?range=${range}`} className={days === range ? 'active' : ''}>
          {range} days
        </Link>
      ))}
    </nav>
  )
}

export function SummaryCard({
  label, value, detail, tone,
}: {
  label: string
  value: string | number
  detail: string
  tone?: 'amber' | 'red' | 'green'
}) {
  return (
    <article className={`summary-card ${tone || ''}`}>
      <p>{label}</p><strong>{value}</strong><span>{detail}</span>
    </article>
  )
}

export function BreakdownBars({ data, total }: { data: { name: string; value: number }[]; total?: number }) {
  const maximum = Math.max(total || 0, ...data.map(item => item.value), 1)
  return (
    <div className="breakdown-list">
      {data.map(item => (
        <div className="breakdown-row" key={item.name}>
          <div><span>{item.name.replaceAll('_', ' ')}</span><strong>{item.value}</strong></div>
          <div className="breakdown-track"><span style={{ width: `${Math.max(2, (item.value / maximum) * 100)}%` }} /></div>
        </div>
      ))}
      {!data.length && <p className="empty-inline">No activity recorded yet.</p>}
    </div>
  )
}

export function formatHours(hours: number | null) {
  if (hours === null) return 'Collecting'
  if (hours < 24) return `${Math.round(hours)} hrs`
  return `${(hours / 24).toFixed(1)} days`
}
