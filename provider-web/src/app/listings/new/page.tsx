import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ListingForm } from '../listing-form'

export const dynamic = 'force-dynamic'

export default async function NewListingPage() {
  const { user, profile } = await requireProvider()
  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="page">
        <Link href="/listings" className="card-link"><ArrowLeft size={14} /> Back to listings</Link>
        <h1 style={{ marginTop: 12 }}>New listing</h1>
        <ListingForm mode="new" userId={user.id} />
      </section>
    </AppShell>
  )
}
