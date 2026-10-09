import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'

export default async function EnquiriesPage() {
  const { profile } = await requireProvider()
  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="page">
        <p className="eyebrow">Provider console</p>
        <h1>Enquiries</h1>
        <p className="muted">Coming soon.</p>
      </section>
    </AppShell>
  )
}
