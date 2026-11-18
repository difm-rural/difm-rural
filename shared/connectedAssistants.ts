// Connected AI assistants (Supabase OAuth grants), shared by the app's and the
// web console's Account → Connected assistants screens and the consent screen.
// UI-free: no supabase, no React.

export const CONSENT_SUMMARY = 'search Rural Connections and read your activity'

// The AI app's name as the client registered it. Dynamic client registration
// lets anyone pick a name, so keep it short and plain and say it is the name
// the app gave itself.
export function assistantName(value: unknown): string {
  const name = String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return name || 'An AI assistant'
}

// Where the assistant will be sent back to, shown as a host so members can spot
// a look-alike. Only http(s) URLs are allowed as redirect targets.
export function redirectHost(value: unknown): string | null {
  try {
    const url = new URL(String(value))
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.host : null
  } catch { return null }
}


export type GrantLike = { client?: { id?: string; name?: string; uri?: string | null } | null; scopes?: string[] | null; granted_at?: string | null }

export type ConnectedAssistant = { clientId: string; name: string; website: string | null; connectedAt: string | null }

export function connectedAssistants(grants: GrantLike[] | null | undefined): ConnectedAssistant[] {
  return (grants || [])
    .filter(g => typeof g?.client?.id === 'string' && g.client.id)
    .map(g => ({
      clientId: g.client!.id!,
      name: assistantName(g.client!.name),
      website: g.client!.uri ? redirectHost(g.client!.uri) : null,
      connectedAt: g.granted_at || null,
    }))
    .sort((a, b) => String(b.connectedAt).localeCompare(String(a.connectedAt)))
}

export function connectedSince(iso: string | null): string {
  if (!iso) return 'Connected'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'Connected' : 'Connected ' + date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Pacific/Auckland' })
}
