import Link from '@/components/navigation-link'
import { SearchX } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { requireProvider } from '@/lib/auth'

// Shown when a notification (or any old link) points at a job, booking or
// listing that has been removed, closed or is no longer visible to the viewer.
export async function MissingItem({ kind, browseHref, browseLabel }: { kind: 'job' | 'booking' | 'listing'; browseHref: string; browseLabel: string }) {
  const { profile } = await requireProvider()
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
    <div className="home-empty missing-item" role="status">
      <SearchX size={28} aria-hidden="true" />
      <h1>This {kind} is no longer available</h1>
      <p>It may have been removed, closed or cancelled, or it&apos;s no longer shared with you.</p>
      <div className="lform-actions missing-item-actions">
        <Link href="/notifications" className="lform-save">Back to notifications</Link>
        <Link href={browseHref} className="lform-cancel">{browseLabel}</Link>
      </div>
    </div>
  </section></AppShell>
}
