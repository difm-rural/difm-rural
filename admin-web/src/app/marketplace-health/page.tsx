import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { requireAdmin } from '@/lib/auth'
import { runMarketplaceHealth } from './actions'

const METRICS = [
  ['registrations', 'New user registrations', 'Auth account creation'],
  ['public_jobs', 'New public jobs', 'Job creation'],
  ['offers_submitted', 'Offers submitted', 'Offer creation · retained offers only'],
  ['offers_accepted', 'Offers accepted', 'No protected offer acceptance timestamp is available'],
  ['jobs_awarded', 'Jobs awarded · audited', 'Distinct jobs with an award transition and no immediate reopen'],
  ['jobs_completed', 'Jobs completed · audited', 'Distinct jobs with a completion transition'],
] as const

const LISTING_TYPES = {
  service: 'Service', grazing: 'Grazing', hire: 'Hire', lease: 'Lease', for_sale: 'For sale', unknown: 'Unknown',
}

const EXCEPTIONS = {
  no_active_offers: 'No active offers',
  offer_awaiting_decision: 'Offer awaiting decision',
  waiting_to_confirm: 'Waiting to confirm',
  overdue_completion: 'Overdue completion',
  expired_requested_date: 'Expired requested date',
  data_quality: 'Data quality',
}

const QUALITY_DETAILS: Record<string, string> = {
  open_with_winner: 'Open job has an accepted offer',
  winner_count: 'Expected exactly one winning offer',
  invalid_winner: 'Winning offer is missing valid provider or creation data',
  schedule_participants: 'Schedule participants disagree with the award',
  award_event_missing_or_inconsistent: 'Award event is missing or inconsistent',
  expected_finish_missing: 'Confirmed schedule has no expected finish',
}

type Run = {
  run_date: string
  source: 'scheduled' | 'manual'
  status: 'running' | 'succeeded' | 'failed' | 'interrupted'
  attempts: number
  started_at: string
  finished_at: string | null
}
type Report = {
  activity_date: string
  as_of: string
  activity: Record<(typeof METRICS)[number][0], number | null> & { listings: Record<string, number> }
  exceptions: {
    job_id: string
    status: string
    code: keyof typeof EXCEPTIONS
    suggested_action: string
    confidence: string
    age_hours: number | null
    deadline_at: string | null
    deadline_source: string | null
    stale_offer_count: number
    winning_offer_count: number
    requested_end: string | null
    detail: string | null
  }[]
}

const clock = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short',
})
const localTime = (value: string | null) => value ? clock.format(new Date(value)) : 'Unavailable'

function ReportContents({ report }: { report: Report }) {
  return (
    <>
      <section className="panel" aria-label="Daily activity">
        <h2>Activity for {report.activity_date}</h2>
        <p>Previous Auckland calendar day. Counts use records available when this report ran.</p>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead><tr><th>Metric</th><th>Count</th><th>Source and coverage</th></tr></thead>
            <tbody>
              {METRICS.map(([key, label, detail]) => (
                <tr key={key}><td>{label}</td><td>{report.activity[key] ?? 'Unavailable'}</td><td>{detail}</td></tr>
              ))}
              <tr><td>New listings</td><td>{Object.values(report.activity.listings).reduce((sum, count) => sum + count, 0)}</td><td>Listing creation</td></tr>
              {Object.entries(LISTING_TYPES).map(([kind, label]) => (
                <tr key={kind}><td>{label} listings</td><td>{report.activity.listings[kind] ?? 0}</td><td>Listing creation by type</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel" aria-label="Job exceptions">
        <h2>Job exceptions</h2>
        <p>Snapshot at {localTime(report.as_of)} Auckland time. A job may appear in more than one group.</p>
        {!report.exceptions.length ? <p>No job exceptions found.</p> : Object.entries(EXCEPTIONS).map(([code, label]) => {
          const rows = report.exceptions.filter(item => item.code === code)
          if (!rows.length) return null
          const ageLabel = code === 'overdue_completion' ? 'Hours since expected finish'
            : code === 'expired_requested_date' ? 'Hours since expiry' : 'Age in hours'
          return (
            <section key={code}>
              <h3>{label} ({rows.length})</h3>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead><tr><th>Job ID</th><th>Status</th><th>{ageLabel}</th><th>Rule deadline · Auckland</th><th>Source / confidence</th><th>Suggested action</th></tr></thead>
                  <tbody>{rows.map(item => (
                    <tr key={item.job_id}>
                      <td>{item.job_id}</td>
                      <td>{item.status}
                        {code === 'offer_awaiting_decision' && <div>{item.stale_offer_count} overdue offers</div>}
                        {code === 'data_quality' && <div>{item.winning_offer_count} winning offers</div>}
                      </td>
                      <td>{item.age_hours === null ? 'Unavailable' : Number(item.age_hours).toFixed(1)}</td>
                      <td>{localTime(item.deadline_at)}{item.requested_end && <div>Requested end {item.requested_end}</div>}</td>
                      <td>{item.deadline_source?.replaceAll('_', ' ') ?? 'Unavailable'} · {item.confidence}</td>
                      <td>{item.detail && <strong>{QUALITY_DETAILS[item.detail] ?? item.detail}. </strong>}{item.suggested_action}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )
        })}
      </section>
    </>
  )
}

export default async function MarketplaceHealthPage({ searchParams }: {
  searchParams: Promise<{ day?: string; source?: string; outcome?: string }>
}) {
  const { supabase, profile } = await requireAdmin()
  const params = await searchParams
  const source = params.source === 'manual' ? 'manual' : 'scheduled'
  const day = typeof params.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : null
  const { data, error } = await supabase.rpc('marketplace_health_history', { p_day: day, p_source: source })
  const history: Run[] = data?.history ?? []
  const selected = history.find(run => run.run_date === (day ?? data?.today) && run.source === source)

  return (
    <AppShell adminName={profile.display_name || profile.full_name || 'Admin'}>
      <header className="page-header">
        <div><h1>Marketplace Health</h1><p>Daily activity and operational exceptions for public jobs.</p></div>
        <form action={runMarketplaceHealth}><button className="button-link" type="submit">Run today’s test report</button></form>
      </header>
      {params.outcome === 'unavailable' && <p role="alert">The test run did not complete. Check run history or try again.</p>}
      {params.outcome === 'in_progress' && <p role="status">A test run is already in progress. Refresh to check its status.</p>}
      {error || !data ? <p role="alert">Marketplace Health data is unavailable.</p>
        : data.report ? <ReportContents report={data.report} />
        : <p role="status">{selected
          ? `This ${source} run is ${selected.status}. Report data is unavailable.`
          : `No ${source} report is available for ${day ?? data.today}.`}</p>}
      {!error && data && <section className="panel">
        <h2>Run history</h2>
        {history.length ? <div className="report-table-wrap"><table className="report-table">
          <thead><tr><th>Auckland run date</th><th>Source</th><th>Status</th><th>Attempts</th><th>Started · Auckland</th><th>Finished · Auckland</th></tr></thead>
          <tbody>{history.map(run => (
            <tr key={`${run.run_date}-${run.source}`}>
              <td><Link href={`/marketplace-health?day=${run.run_date}&source=${run.source}`}>{run.run_date}</Link></td>
              <td>{run.source}</td><td>{run.status}</td><td>{run.attempts}</td>
              <td>{localTime(run.started_at)}</td><td>{localTime(run.finished_at)}</td>
            </tr>
          ))}</tbody>
        </table></div> : <p>No runs recorded yet.</p>}
      </section>}
    </AppShell>
  )
}
