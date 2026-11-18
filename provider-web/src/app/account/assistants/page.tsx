import Link from '@/components/navigation-link'
import { Bot } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { connectedAssistants, connectedSince, CONSENT_SUMMARY } from '@/lib/oauth-consent'
import { disconnectAssistant } from './actions'

export const dynamic = 'force-dynamic'

export default async function ConnectedAssistantsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams
  const { supabase, profile } = await requireProvider('/account/assistants')
  const [{ data: grants, error }, { data: status }] = await Promise.all([
    supabase.auth.oauth.listGrants(),
    supabase.rpc('ai_connector_status'),
  ])
  const assistants = connectedAssistants(grants)
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
    <Link href="/account" className="card-link">← Account</Link>
    <h1>Connected assistants</h1>
    <p className="muted">AI assistants you’ve allowed to {CONSENT_SUMMARY}. They can’t post, offer, book or send messages, and they only see towns and areas, never exact addresses.</p>
    {result === 'disconnected' && <p className="home-clear" role="status">Disconnected. That assistant can no longer reach your account.</p>}
    {result === 'error' && <p className="form-error" role="alert">Couldn’t disconnect that assistant. Refresh and try again.</p>}
    {status?.paused && <p className="form-error" role="status">Rural Connections has paused assistant access for your account. Contact us if you think this is a mistake.</p>}
    {status && status.ai_enabled === false && <p className="muted" role="status">Assistant access is turned off for everyone at the moment.</p>}
    {error ? <p role="alert">Couldn’t load your connected assistants. Refresh to try again.</p>
      : assistants.length === 0 ? <article className="card"><p>No assistants are connected.</p><p className="muted">To connect one, add Rural Connections as a connector in your AI assistant. You’ll come back here to allow it.</p></article>
      : <ul className="assistant-list">{assistants.map(a => <li className="card assistant-row" key={a.clientId}>
          <Bot size={22} aria-hidden="true" />
          <span><strong>{a.name}</strong><small>{connectedSince(a.connectedAt)}{a.website ? ' · ' + a.website : ''}</small></span>
          <form action={disconnectAssistant}><input type="hidden" name="client_id" value={a.clientId} /><button className="lform-cancel" aria-label={'Disconnect ' + a.name}>Disconnect</button></form>
        </li>)}</ul>}
  </section></AppShell>
}
