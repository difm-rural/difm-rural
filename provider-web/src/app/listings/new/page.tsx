import Link from '@/components/navigation-link'
import { ArrowLeft } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ListingForm } from '../listing-form'
import { SideKicker } from '@/components/side-kicker'

export const dynamic = 'force-dynamic'

export default async function NewListingPage() {
  const { user, profile } = await requireProvider()
  return (
    <AppShell refreshOnAlerts={false} providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="page">
        <Link href="/listings" className="card-link"><ArrowLeft size={14} /> Back to listings</Link>
        <header className="work-head listing-head"><SideKicker side="listing" label="Listings · offered"/><h1>New listing</h1></header>
        <ListingForm mode="new" userId={user.id} />
      </section>
    </AppShell>
  )
}
