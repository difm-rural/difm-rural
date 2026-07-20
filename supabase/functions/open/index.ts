// Public https bridge into the app: /functions/v1/open?n=<notification_id>
//
// Why this exists: emails can't use the difmrural:// scheme directly — Outlook
// (and Gmail) refuse to linkify custom schemes, so the link renders inert. An
// https URL is linkified everywhere, and this page bounces the visitor into the
// app. On desktop, or when the app isn't installed, they get a friendly page
// instead of a dead link.
//
// Deploy: supabase functions deploy open --no-verify-jwt
//   (--no-verify-jwt is required: this is opened from an email client with no
//   Supabase JWT. It carries no data of its own — it only reflects an opaque id
//   into a deep link, and the app still requires the user's own session before
//   showing anything.)

const APP_SCHEME = 'difmrural'
const BRAND_LOGO_URL = Deno.env.get('BRAND_LOGO_URL') ?? ''

// Ids are reflected into HTML/JS, so accept only an opaque uuid-ish token.
const ID_RE = /^[0-9a-fA-F-]{8,64}$/

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function page(deepLink: string) {
  const safeLink = escapeHtml(deepLink)
  const logo = BRAND_LOGO_URL
    ? `<img src="${escapeHtml(BRAND_LOGO_URL)}" width="64" height="64" alt=""
           style="display:block;margin:0 auto 18px;border-radius:16px" />`
    : ''
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opening Rural Connections…</title>
  </head>
  <body style="margin:0;background:#f5f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2923">
    <div style="max-width:420px;margin:0 auto;padding:56px 24px;text-align:center">
      ${logo}
      <div style="font-size:13px;font-weight:700;letter-spacing:1.4px;color:#2d6a4f;margin-bottom:16px">RURAL CONNECTIONS</div>
      <p style="font-size:17px;line-height:1.5;margin:0 0 24px">Opening the app…</p>
      <p style="margin:0 0 28px">
        <a href="${safeLink}"
           style="display:inline-block;background:#2d6a4f;color:#fff;font-weight:700;font-size:15px;
                  text-decoration:none;padding:13px 22px;border-radius:10px">Open Rural Connections</a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#66736b;margin:0">
        Nothing happening? Open this link on the phone where Rural Connections is
        installed — the app can't be opened from a desktop.
      </p>
    </div>
    <script>
      // Attempt the app immediately; the page above stays as the fallback.
      setTimeout(function () { window.location.href = ${JSON.stringify(deepLink)} }, 50)
    </script>
  </body>
</html>`
}

Deno.serve((req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('n') ?? ''
  const deepLink = ID_RE.test(id)
    ? `${APP_SCHEME}://notification/${id}`
    : `${APP_SCHEME}://`

  return new Response(page(deepLink), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
