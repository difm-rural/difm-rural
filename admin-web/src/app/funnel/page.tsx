import { Bookmark, Camera, Gauge, Repeat2 } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { BreakdownBars, formatHours, RangePicker, SummaryCard } from '@/components/reporting'
import { getEngagementOverview } from '@/lib/engagement'

export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams
  const requested = Number(params.range || 30)
  const days = [7, 30, 90].includes(requested) ? requested : 30
  const data = await getEngagementOverview(days)
  const { overview } = data
  const maximum = Math.max(overview.funnel[0]?.value || 0, 1)

  return (
    <AppShell adminName={data.adminName}>
      <header className="page-header">
        <div><p className="eyebrow">Marketplace funnel</p><h1>From posting to completion</h1><p>Where work gains momentum, and where it falls away.</p></div>
        <RangePicker base="/funnel" days={days} />
      </header>

      <section className="summary-grid">
        <SummaryCard label="First provider view" value={formatHours(overview.timing.medianHoursToFirstView)} detail="Median time after a job is posted" />
        <SummaryCard label="First offer" value={formatHours(overview.timing.medianHoursToFirstOffer)} detail="Median time after a job is posted" />
        <SummaryCard label="Repeat jobs" value={overview.retention.repeatJobs} detail={`${overview.retention.repeatRate}% of jobs in this period`} tone="green" />
        <SummaryCard label="Saved-search matches" value={overview.retention.savedInterestMatches} detail="Matches created in this period" />
      </section>

      <section className="dashboard-grid funnel-layout">
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Conversion</p><h2>Job journey</h2></div><Gauge size={20} /></div>
          <div className="funnel-list">
            {overview.funnel.map((step, index) => {
              const previous = overview.funnel[index - 1]
              const conversion = previous?.value ? Math.round((step.value / previous.value) * 100) : null
              return (
                <div className="funnel-step" key={step.name}>
                  <div className="funnel-label"><span>{step.name}</span><strong>{step.value}</strong></div>
                  <div className="funnel-track"><span style={{ width: `${Math.max(step.value ? 4 : 0, (step.value / maximum) * 100)}%` }} /></div>
                  <small>{conversion === null ? 'Starting cohort' : `${conversion}% from previous step`}</small>
                </div>
              )
            })}
          </div>
          <p className="panel-footnote">Each step counts distinct jobs created in the selected period. Later stages can still increase as those jobs progress.</p>
        </article>

        <div className="funnel-side">
          <article className="panel">
            <div className="panel-heading"><div><p className="panel-kicker">Repeat and saved work</p><h2>Retention signals</h2></div><Repeat2 size={20} /></div>
            <dl className="compact-metrics large">
              <div><dt>Active saved interests</dt><dd>{overview.retention.activeSavedInterests}</dd></div>
              <div><dt>People following searches</dt><dd>{overview.retention.savedInterestUsers}</dd></div>
              <div><dt>Instant alerts</dt><dd>{overview.retention.instantInterests}</dd></div>
              <div><dt>Daily summaries</dt><dd>{overview.retention.dailyInterests}</dd></div>
              <div><dt>Paused or off</dt><dd>{overview.retention.pausedInterests}</dd></div>
            </dl>
          </article>
          <article className="panel">
            <div className="panel-heading"><div><p className="panel-kicker">Listing quality</p><h2>Actionable improvements</h2></div><Camera size={20} /></div>
            <dl className="compact-metrics large">
              <div><dt>Jobs without photos</dt><dd>{overview.listing.missingPhotos}</dd></div>
              <div><dt>Open budget</dt><dd>{overview.listing.openBudgets}</dd></div>
              <div><dt>Short descriptions</dt><dd>{overview.listing.shortDescriptions}</dd></div>
              <div><dt>No views after 48 hours</dt><dd>{overview.listing.noViews48h}</dd></div>
              <div><dt>Views but no offers</dt><dd>{overview.listing.viewedNoOffers48h}</dd></div>
            </dl>
          </article>
        </div>
      </section>

      <section className="panel compact-report">
        <div className="panel-heading"><div><p className="panel-kicker">Alert frequency</p><h2>Saved-interest controls</h2></div><Bookmark size={20} /></div>
        <BreakdownBars data={[
          { name: 'Instant', value: overview.retention.instantInterests },
          { name: 'Daily', value: overview.retention.dailyInterests },
          { name: 'Paused or off', value: overview.retention.pausedInterests },
        ]} />
      </section>
    </AppShell>
  )
}
