import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'

export const dynamic = 'force-dynamic'

// Step B stub — the create/edit form lands here next.
export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireProvider()
  await params // reserved for the step-B form
  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="page">
        <Link href="/listings" className="card-link"><ArrowLeft size={14} /> Back to listings</Link>
        <h1 style={{ marginTop: 12 }}>Edit listing</h1>
        <p className="muted">The edit form is coming in step B.</p>
      </section>
    </AppShell>
  )
}
