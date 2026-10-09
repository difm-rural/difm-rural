import Link from 'next/link'

export default function ProvidersOnlyPage() {
  return (
    <main className="message-page">
      <div className="message-card">
        <div className="brand-mark">RC</div>
        <p className="eyebrow">Providers only</p>
        <h1>This area is for providers</h1>
        <p>Your account is signed in, but it isn&apos;t set up as a provider yet. In the Rural Connections app you can add providing to your account, then come back here to manage your listings and enquiries.</p>
        <Link href="/auth/signout" className="text-link">Sign in with another account</Link>
      </div>
    </main>
  )
}
