import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ListingForm, type EditListing } from '../../listing-form'

export const dynamic = 'force-dynamic'

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user, profile } = await requireProvider()

  // RLS plus the explicit provider_id filter: a provider can only load their own row.
  const { data: listing } = await supabase
    .from('services')
    .select('id, kind, title, category, description, location_name, travel_range_km, pricing_type, rate, unit_label, minimum_units, max_units, payment_timing, materials')
    .eq('id', id)
    .eq('provider_id', user.id)
    .maybeSingle()

  if (!listing) notFound()

  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="page">
        <Link href="/listings" className="card-link"><ArrowLeft size={14} /> Back to listings</Link>
        <h1 style={{ marginTop: 12 }}>Edit listing</h1>
        <ListingForm mode="edit" userId={user.id} listing={listing as EditListing} />
      </section>
    </AppShell>
  )
}
