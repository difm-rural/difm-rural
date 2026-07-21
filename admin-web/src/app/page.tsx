import Link from 'next/link'
import { ArrowRight, BriefcaseBusiness, Clock3, Handshake, Megaphone, UsersRound, Wrench } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { CategoryBars, JobsTimeline, StatusBars } from '@/components/dashboard-charts'
import { getDashboardData } from '@/lib/dashboard'

function formatLifecycle(hours: number | null) {
  if (hours === null) return 'Collecting'
  if (hours < 48) return `${Math.round(hours)} hrs`
  return `${(hours / 24).toFixed(1)} days`
}

function KpiCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string | number; detail: string; icon: typeof UsersRound; tone?: string }) {
  return (
    <article className={`kpi-card ${tone || ''}`}>
      <div className="kpi-icon"><Icon size={19} /></div>
      <p>{label}</p><strong>{value}</strong><span>{detail}</span>
    </article>
  )
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams
  const requested = Number(params.range || 30)
  const days = [7, 30, 90].includes(requested) ? requested : 30
  const data = await getDashboardData(days)

  return (
    <AppShell adminName={data.adminName}>
      <div className="dashboard-page">
      <header className="page-header">
        <div><p className="eyebrow">Marketplace pulse</p><h1>Good morning, {data.adminName.split(' ')[0]}</h1><p>Here is what is happening across Rural Connections.</p></div>
        <nav className="range-picker" aria-label="Dashboard date range">
          {[7, 30, 90].map(range => <Link key={range} href={`/?range=${range}`} className={days === range ? 'active' : ''}>{range} days</Link>)}
        </nav>
      </header>

      <section className="kpi-grid" aria-label="Marketplace summary">
        <KpiCard label="Open jobs" value={data.kpis.openJobs} detail={`${data.kpis.jobsPosted} posted in this period`} icon={BriefcaseBusiness} tone="amber" />
        <KpiCard label="Active services" value={data.kpis.activeServices} detail="Available to book now" icon={Wrench} />
        <KpiCard label="Active bookings" value={data.kpis.activeBookings} detail="Moving through delivery" icon={Handshake} />
        <KpiCard label="New users" value={data.kpis.newUsers} detail={`${data.kpis.users} total accounts`} icon={UsersRound} />
        <KpiCard label="Average lifecycle" value={formatLifecycle(data.kpis.averageLifecycleHours)} detail="Posting to confirmed completion" icon={Clock3} />
      </section>

      <section className="dashboard-grid primary-grid">
        <article className="panel wide-panel">
          <div className="panel-heading"><div><p className="panel-kicker">Demand</p><h2>Jobs over time</h2></div><div className="chart-legend"><span className="green-dot" />Posted<span className="amber-dot" />Open inventory</div></div>
          <JobsTimeline data={data.timeline} />
          <p className="panel-footnote">Open-job inventory history is captured daily from 21 July 2026. Jobs posted are available for the full selected period.</p>
        </article>
        <article className="panel campaign-panel">
          <div className="panel-heading"><div><p className="panel-kicker">Engagement</p><h2>Seasonal campaigns</h2></div><Megaphone size={20} /></div>
          <div className="campaign-counts"><div><strong>{data.campaign.live}</strong><span>Live</span></div><div><strong>{data.campaign.scheduled}</strong><span>Scheduled</span></div></div>
          <dl className="compact-metrics"><div><dt>Card impressions</dt><dd>{data.campaign.impressions}</dd></div><div><dt>Actions</dt><dd>{data.campaign.actions}</dd></div><div><dt>Dismissed</dt><dd>{data.campaign.dismissed}</dd></div><div><dt>Emails sent</dt><dd>{data.campaign.emails}</dd></div></dl>
          <Link href="/campaigns" className="panel-link">Manage campaigns <ArrowRight size={16} /></Link>
        </article>
      </section>

      <section className="dashboard-grid triple-grid">
        <article className="panel"><div className="panel-heading"><div><p className="panel-kicker">Jobs</p><h2>By status</h2></div></div><StatusBars data={data.jobStatuses} /></article>
        <article className="panel"><div className="panel-heading"><div><p className="panel-kicker">Services</p><h2>Listing status</h2></div></div><StatusBars data={data.serviceStatuses} /></article>
        <article className="panel"><div className="panel-heading"><div><p className="panel-kicker">Bookings</p><h2>By status</h2></div></div><StatusBars data={data.bookingStatuses} /></article>
      </section>

      <section className="dashboard-grid lower-grid">
        <article className="panel"><div className="panel-heading"><div><p className="panel-kicker">Demand mix</p><h2>Jobs by category</h2></div></div><CategoryBars data={data.categories} /></article>
        <article className="panel recent-panel">
          <div className="panel-heading"><div><p className="panel-kicker">Operations</p><h2>Recent jobs</h2></div><span className="period-label">Latest</span></div>
          <div className="data-list">{data.recentJobs.map(job => <div className="data-row" key={job.id}><div><strong>{job.title}</strong><span>{job.category || 'Uncategorised'} · {job.location_name || 'Location not set'}</span></div><span className={`status-chip ${job.status}`}>{job.status.replaceAll('_', ' ')}</span></div>)}</div>
        </article>
      </section>
      </div>
    </AppShell>
  )
}
