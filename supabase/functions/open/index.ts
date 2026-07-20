// PARKED (July 2026) — deployed but nothing links to it. See the note in
// process-email-outbox: Chrome blocks server-initiated redirects to a custom
// scheme, so this can't work on its own. Kept because it's the right shape to
// reuse once Universal Links / App Links are set up (needs web hosting on
// ruralconnections.nz + a native rebuild).
//
// Public https bridge into the app: /functions/v1/open?n=<notification_id>
//
// Why this exists: emails can't carry a difmrural:// link — Outlook (and Gmail)
// refuse to linkify custom schemes, so the link renders completely inert. An
// https URL is linkified everywhere, and this endpoint redirects into the app.
//
// Why a bare 302 and not a nice landing page: Supabase's edge gateway forces
// `Content-Type: text/plain` and `Content-Security-Policy: default-src 'none';
// sandbox` onto every function response, which blocks scripts, images and
// navigation — an HTML page here is inert. A 302 has no document, so the
// Location header is honoured untouched.
//
// Trade-off: if the app isn't installed (or you're on a desktop) the browser
// shows its own "can't open" error rather than a friendly page. Hosting a small
// static page on ruralconnections.nz — or proper universal links — is the
// upgrade path.
//
// Deploy: supabase functions deploy open --no-verify-jwt
//   (--no-verify-jwt is required: opened from an email client with no Supabase
//   JWT. It carries no data — it only reflects an opaque id into a deep link,
//   and the app still requires the user's own session before showing anything.)

const APP_SCHEME = 'difmrural'

// The id lands in a Location header, so accept only an opaque uuid-ish token.
const ID_RE = /^[0-9a-fA-F-]{8,64}$/

Deno.serve((req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('n') ?? ''
  const deepLink = ID_RE.test(id)
    ? `${APP_SCHEME}://notification/${id}`
    : `${APP_SCHEME}://`

  return new Response(null, {
    status: 302,
    headers: {
      Location: deepLink,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
})
