'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'

type BrowserClient = SupabaseClient
let browserClient: BrowserClient | null = null

export function createClient(): BrowserClient {
  const create = () => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  // Never share one client between requests if this runs during server render.
  if (typeof window === 'undefined') return create()
  if (browserClient) return browserClient
  browserClient = create()
  keepRealtimeAuthCurrent(browserClient)
  return browserClient
}

// Realtime applies row-level security with the token it was last given, and the
// server closes every channel once that token expires. supabase-js forwards new
// tokens on its own, but a background tab can sleep through its hourly refresh,
// so make sure realtime has the current session token:
//   - on sign-in, page load and every token refresh, and
//   - when the tab comes back into view (refreshing the session first if it
//     lapsed while hidden).
// Channels that were closed meanwhile rejoin through liveChannel (lib/realtime).
function keepRealtimeAuthCurrent(client: BrowserClient) {
  if (typeof window === 'undefined') return
  client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    if (session?.access_token && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
      void client.realtime.setAuth(session.access_token)
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    void refreshRealtimeAuth(client)
  })
}

// Current session token → realtime. getSession() refreshes an expired session.
export async function refreshRealtimeAuth(client: BrowserClient = createClient()) {
  try {
    const { data } = await client.auth.getSession()
    if (data.session?.access_token) await client.realtime.setAuth(data.session.access_token)
  } catch { /* offline: the next rejoin or the polling fallback catches up */ }
}
