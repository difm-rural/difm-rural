import { MessageSquareHeart } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { SummaryCard } from '@/components/reporting'
import { getFlowFeedback } from '@/lib/feedback'

const FLOW_LABELS: Record<string, string> = { post_job: 'Post a job' }

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Pacific/Auckland',
  })
}

export default async function FeedbackPage() {
  const data = await getFlowFeedback()

  return (
    <AppShell adminName={data.adminName}>
      <header className="page-header">
        <div><p className="eyebrow">Product feedback</p><h1>Flow feedback</h1><p>Ease ratings people leave right after completing a flow.</p></div>
      </header>

      <section className="summary-grid">
        <SummaryCard label="Responses" value={data.total} detail="Most recent 200" />
        <SummaryCard label="Average ease" value={data.averageEase === null ? '—' : `${data.averageEase.toFixed(1)} / 5`} detail="1 = very hard, 5 = very easy" tone={data.averageEase !== null && data.averageEase >= 4 ? 'green' : data.averageEase !== null && data.averageEase < 3 ? 'red' : 'amber'} />
        <SummaryCard label="With comments" value={data.withComments} detail="Responses that added a note" />
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="panel-kicker">Newest first</p><h2>Responses</h2></div><MessageSquareHeart size={20} /></div>
        {data.error
          ? <p className="empty-inline table-empty">Could not load feedback. Refresh to try again.</p>
          : <div className="report-table-wrap">
              <table className="report-table">
                <thead><tr><th>When</th><th>Flow</th><th>Ease</th><th>Comment</th><th>Platform</th><th>Version</th></tr></thead>
                <tbody>
                  {data.rows.map(row => (
                    <tr key={row.id}>
                      <td>{formatWhen(row.created_at)}</td>
                      <td>{FLOW_LABELS[row.flow] || row.flow}</td>
                      <td><span aria-label={`${row.ease} out of 5`}>{row.ease} / 5</span></td>
                      <td>{row.comment?.trim() || <span className="muted">—</span>}</td>
                      <td>{row.platform}</td>
                      <td>{row.app_version || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && <p className="empty-inline table-empty">No feedback yet.</p>}
            </div>}
      </section>
    </AppShell>
  )
}
