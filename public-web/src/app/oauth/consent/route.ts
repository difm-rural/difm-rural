// Supabase Auth's OAuth 2.1 server sends members to <Site URL>/oauth/consent.
// If the Site URL is this public site, forward to the consent screen in the
// web console, which signs the member in and shows Allow / Deny. Only the
// authorization_id is carried over, and only if it looks like one.
const CONSOLE_CONSENT = 'https://dev.ruralconnections.nz/oauth/consent'

export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('authorization_id')?.trim() || ''
  const target = /^[A-Za-z0-9_-]{8,200}$/.test(id)
    ? CONSOLE_CONSENT + '?authorization_id=' + encodeURIComponent(id)
    : CONSOLE_CONSENT
  return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
