import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assistantName, authorizationId, CONSENT_SUMMARY, loginPathForConsent, redirectHost, safeRedirect } from '@/lib/oauth-consent'
import { allowAssistant, denyAssistant } from './actions'

export const dynamic = 'force-dynamic'

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="login-page consent-page">
    <section className="login-brand">
      <p className="eyebrow light">Rural Connections</p>
      <h1>Connect an AI assistant</h1>
      <p>An assistant you trust can search Rural Connections and read your activity for you. It can’t post, offer, book or send messages.</p>
      <div className="login-rule" />
      <p className="login-note">You can disconnect it at any time from Account → Connected assistants.</p>
    </section>
    <section className="login-panel"><div className="login-card">
      <div className="login-barn-mark" aria-hidden="true"><Image src="/brand/barn-badge-red.png" alt="" width={52} height={52} priority /></div>
      {children}
    </div></section>
  </main>
}

function Problem({ text }: { text: string }) {
  return <Shell><h2>This request can’t be used</h2><p className="form-error" role="alert">{text}</p>
    <p className="muted">Go back to your AI assistant and start connecting Rural Connections again.</p></Shell>
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string; error?: string }> }) {
  const params = await searchParams
  const id = authorizationId(params.authorization_id)
  if (!id) return <Problem text="The connection request is missing or invalid." />

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(loginPathForConsent(id))

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
  if (error || !data) return <Problem text="This connection request has expired or was already used." />
  // Already allowed earlier for the same access: go straight back.
  if (!('authorization_id' in data)) {
    const target = safeRedirect(data.redirect_url)
    if (!target) return <Problem text="The assistant’s return address isn’t valid." />
    redirect(target)
  }

  const name = assistantName(data.client?.name)
  const host = redirectHost(data.redirect_uri)
  return <Shell>
    <h2>Allow {name}?</h2>
    <p><strong>{name}</strong> wants to <strong>{CONSENT_SUMMARY}</strong>.</p>
    <ul className="consent-list">
      <li>Search open jobs and active listings</li>
      <li>Read your jobs, offers and bookings, and whose turn it is</li>
      <li>Read your conversations</li>
      <li>Towns and areas only. It never sees exact addresses</li>
    </ul>
    <p className="muted">Signed in as {user.email}{host ? <> · returns to <strong>{host}</strong></> : null}. “{name}” is the name the app gave itself. Allow it only if you recognise it.</p>
    {params.error === 'decision' && <p className="form-error" role="alert">That didn’t go through. Try again, or start again from your assistant.</p>}
    <div className="consent-actions">
      <form action={denyAssistant}><input type="hidden" name="authorization_id" value={id} /><button className="lform-cancel">Deny</button></form>
      <form action={allowAssistant}><input type="hidden" name="authorization_id" value={id} /><button className="lform-save">Allow</button></form>
    </div>
  </Shell>
}
