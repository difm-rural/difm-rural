import { BellRing, MapPinned, ShieldCheck, UsersRound } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { BreakdownBars, RangePicker, SummaryCard } from '@/components/reporting'
import { getEngagementOverview } from '@/lib/engagement'

function percentage(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0
}

export default async function ProvidersPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams
  const requested = Number(params.range || 30)
  const days = [7, 30, 90].includes(requested) ? requested : 30
  const data = await getEngagementOverview(days)
  const { providers } = data.overview

  return (
    <AppShell adminName={data.adminName}>
      <header className="page-header">
        <div><p className="eyebrow">Provider supply</p><h1>Coverage and readiness</h1><p>Whether the right providers are available where demand appears.</p></div>
        <RangePicker base="/providers" days={days} />
      </header>

      <section className="summary-grid five">
        <SummaryCard label="Provider accounts" value={providers.total} detail="Provider and dual-role accounts" />
        <SummaryCard label="Available" value={providers.available} detail={`${percentage(providers.available, providers.total)}% currently eligible for matching`} tone="green" />
        <SummaryCard label="Availability stale" value={providers.staleAvailability} detail="Not refreshed in the last 14 days" tone="amber" />
        <SummaryCard label="Opportunity alerts on" value={providers.alertOptIn} detail={`${percentage(providers.alertOptIn, providers.total)}% use instant or daily alerts`} />
        <SummaryCard label="Open jobs without matches" value={providers.zeroMatchOpenJobs} detail="Demand with no current eligible supply" tone={providers.zeroMatchOpenJobs ? 'red' : 'green'} />
      </section>

      <section className="dashboard-grid provider-top-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Readiness</p><h2>Availability status</h2></div><UsersRound size={20} /></div>
          <BreakdownBars data={providers.availability} total={providers.total} />
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Engagement</p><h2>Opportunity alert mode</h2></div><BellRing size={20} /></div>
          <BreakdownBars data={providers.alertModes} total={providers.total} />
        </article>
        <article className="panel privacy-panel">
          <ShieldCheck size={22} />
          <div><h2>Privacy-safe administration</h2><p>This console reports aggregate supply, availability and alert adoption. Individual saved searches, travel radii and notification choices remain user-controlled.</p></div>
        </article>
      </section>

      <section className="dashboard-grid provider-tables">
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Capability coverage</p><h2>Open demand by category</h2></div></div>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>Category</th><th>Open jobs</th><th>With matches</th><th>Coverage</th></tr></thead>
              <tbody>
                {providers.categoryCoverage.map(row => (
                  <tr key={row.name}><td>{row.name}</td><td>{row.openJobs}</td><td>{row.matchedJobs}</td><td><span className={`coverage-value ${percentage(row.matchedJobs, row.openJobs) < 60 ? 'low' : ''}`}>{percentage(row.matchedJobs, row.openJobs)}%</span></td></tr>
                ))}
              </tbody>
            </table>
            {!providers.categoryCoverage.length && <p className="empty-inline table-empty">No open demand to compare.</p>}
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Regional supply</p><h2>Providers by home region</h2></div><MapPinned size={20} /></div>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>Region</th><th>Providers</th><th>Available</th><th>Ready</th></tr></thead>
              <tbody>
                {providers.regionSupply.map(row => (
                  <tr key={row.name}><td>{row.name}</td><td>{row.providers}</td><td>{row.available}</td><td>{percentage(row.available, row.providers)}%</td></tr>
                ))}
              </tbody>
            </table>
            {!providers.regionSupply.length && <p className="empty-inline table-empty">No provider regions recorded yet.</p>}
          </div>
        </article>
      </section>
    </AppShell>
  )
}
