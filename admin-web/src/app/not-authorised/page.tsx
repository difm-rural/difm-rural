import Link from 'next/link'

export default function NotAuthorisedPage() {
  return (
    <main className="message-page">
      <div className="message-card">
        <div className="brand-mark">RC</div>
        <p className="eyebrow">Access restricted</p>
        <h1>Administrator access required</h1>
        <p>This account is valid, but it has not been granted Rural Connections administrator access.</p>
        <Link href="/auth/signout" className="text-link">Sign in with another account</Link>
      </div>
    </main>
  )
}
