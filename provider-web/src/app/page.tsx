import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { KIND_PRICING } from '@shared/listingPricing'

export default async function DashboardPage() {
  const { profile } = await requireProvider()
  // /shared proof: the shared listing model resolves + type-checks under option (a).
  const kindCount = Object.keys(KIND_PRICING).length

  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="page">
        <p className="eyebrow">Provider console</p>
        <h1>Dashboard</h1>
        <p className="muted">Foundation ready — auth, the provider guard and the shell are in place. Screens to come: Dashboard, Enquiries, Listings.</p>
        <p className="muted">Shared listing model wired via <code>@shared/listingPricing</code> — {kindCount} listing kinds available.</p>
      </section>
    </AppShell>
  )
}
