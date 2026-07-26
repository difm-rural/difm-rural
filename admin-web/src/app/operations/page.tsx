import Link from 'next/link'
import { AlertTriangle, CalendarClock, MailWarning, MapPin, Radar } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { BreakdownBars, RangePicker, SummaryCard } from '@/components/reporting'
import { getOperationsData, OperationRow } from '@/lib/engagement'

const ISSUE_COPY: Record<OperationRow['issue_code'], { label: string; guidance: string }> = {
  no_views: { label: 'No provider views', guidance: 'Check the photo, description, category and search radius.' },
  views_no_offers: { label: 'Viewed, no offers', guidance: 'The dates or scope may be stopping providers from responding.' },
  zero_matches: { label: 'No matching providers', guidance: 'Review category coverage and provider supply in this area.' },
  unscheduled: { label: 'Confirmed but unscheduled', guidance: 'The provider still needs to confirm an arrival window.' },
  overdue: { label: 'Past planned finish', guidance: 'Check whether the work is complete or needs a revised schedule.' },
}

function QueueItem({ item }: { item: OperationRow }) {
  const copy = ISSUE_COPY[item.issue_code]
  return (
    <article className={`queue-item ${item.severity}`}>
      <div className="queue-severity"><AlertTriangle size={16} /><span>{item.severity}</span></div>
      <div className="queue-main">
        <div className="queue-title-line">
          <div><p>{copy.label}</p><h3>{item.title}</h3></div>
          <span className={`status-chip ${item.status}`}>{item.status.replaceAll('_', ' ')}</span>
        </div>
        <p className="queue-guidance">{copy.guidance}</p>
        <div className="queue-meta">
          <span>{item.category || 'Uncategorised'}</span>
          <span><MapPin size={12} />{item.location || 'Location not supplied'}</span>
          <span>{Math.round(item.age_hours)} hours</span>
          {item.record_type === 'job' && <span>{item.provider_views} views · {item.matching_providers} matches · {item.offers} offers</span>}
        </div>
      </div>
      <Link href={item.record_type === 'job' ? '/details/open-jobs' : '/details/active-bookings'}>View list</Link>
    </article>
  )
}

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams
  const requested = Number(params.range || 30)
  const days = [7, 30, 90].includes(requested) ? requested : 30
  const data = await getOperationsData(days)
  const { overview } = data
  const high = data.queue.filter(item => item.severity === 'high')
  const medium = data.queue.filter(item => item.severity === 'medium')

  return (
    <AppShell adminName={data.adminName}>
      <header className="page-header">
        <div><p className="eyebrow">Operations</p><h1>What needs attention</h1><p>Evidence-based exceptions that may need intervention.</p></div>
        <RangePicker base="/operations" days={days} />
      </header>

      <section className="summary-grid">
        <SummaryCard label="Stalled listings" value={overview.listing.noViews48h + overview.listing.viewedNoOffers48h} detail="Open 48+ hours without an offer" tone="amber" />
        <SummaryCard label="Supply gaps" value={overview.listing.zeroMatches} detail="Open jobs with no eligible provider match" tone="red" />
        <SummaryCard label="Unscheduled work" value={overview.coordination.unscheduledWork} detail="Confirmed work without an arrival window" />
        <SummaryCard label="Overdue work" value={overview.coordination.overdue} detail="Past the planned completion window" tone={overview.coordination.overdue ? 'red' : 'green'} />
      </section>

      <section className="operations-layout">
        <article className="panel queue-panel">
          <div className="panel-heading">
            <div><p className="panel-kicker">Intervention queue</p><h2>{data.queue.length} current signals</h2></div>
            <Radar size={20} />
          </div>
          <p className="privacy-note">These signals use real views, matches, offers and schedules. No activity is inferred or manufactured.</p>
          <div className="queue-section">
            <h3>High priority <span>{high.length}</span></h3>
            {high.map(item => <QueueItem key={item.queue_id} item={item} />)}
            {!high.length && <p className="empty-inline">Nothing high priority right now.</p>}
          </div>
          <div className="queue-section">
            <h3>Watch list <span>{medium.length}</span></h3>
            {medium.map(item => <QueueItem key={item.queue_id} item={item} />)}
            {!medium.length && <p className="empty-inline">Nothing on the watch list.</p>}
          </div>
        </article>

        <aside className="operations-side">
          <article className="panel">
            <div className="panel-heading"><div><p className="panel-kicker">Work coordination</p><h2>Calendar health</h2></div><CalendarClock size={20} /></div>
            <dl className="compact-metrics large">
              <div><dt>Active confirmed work</dt><dd>{overview.coordination.activeWork}</dd></div>
              <div><dt>Scheduled</dt><dd>{overview.coordination.scheduledWork}</dd></div>
              <div><dt>Due today</dt><dd>{overview.coordination.upcomingToday}</dd></div>
              <div><dt>Due within 7 days</dt><dd>{overview.coordination.upcomingWeek}</dd></div>
              <div><dt>Late notices in period</dt><dd>{overview.coordination.lateNotices}</dd></div>
              <div><dt>Completion prompts</dt><dd>{overview.coordination.completionPrompts}</dd></div>
            </dl>
          </article>
          <article className="panel">
            <div className="panel-heading"><div><p className="panel-kicker">Delivery health</p><h2>Transactional email</h2></div><MailWarning size={20} /></div>
            <div className="delivery-alerts">
              <div><strong>{overview.delivery.failedEmails}</strong><span>Failed in period</span></div>
              <div><strong>{overview.delivery.pendingEmails}</strong><span>Pending over 15 min</span></div>
            </div>
            <BreakdownBars data={overview.delivery.emailStatuses} />
          </article>
        </aside>
      </section>
    </AppShell>
  )
}
