import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { DETAIL_VIEWS, DetailView, getDetailData } from '@/lib/details'

export default async function DetailPage({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ view }, query] = await Promise.all([params, searchParams])
  if (!DETAIL_VIEWS.includes(view as DetailView)) notFound()
  const requested = Number(query.range || 30)
  const days = [7, 30, 90].includes(requested) ? requested : 30
  const detail = await getDetailData(view as DetailView, days)

  return (
    <AppShell adminName={detail.adminName}>
      <header className="page-header detail-header">
        <div><p className="eyebrow">Marketplace detail</p><h1>{detail.title}</h1><p>{detail.description}</p></div>
        <Link href={`/?range=${days}`} className="back-link"><ArrowLeft size={16} />Back to overview</Link>
      </header>
      {detail.rows.length ? (
        <section className="detail-table-wrap" aria-label={`${detail.title} details`}>
          <table className="detail-table">
            <thead><tr>{detail.columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>{detail.rows.map(row => <tr key={row.id}>{detail.columns.map(column => <td key={column.key}>{row.values[column.key]}</td>)}</tr>)}</tbody>
          </table>
        </section>
      ) : (
        <section className="detail-empty"><h2>No matching records</h2><p>There is nothing to display for this selection yet.</p></section>
      )}
    </AppShell>
  )
}
