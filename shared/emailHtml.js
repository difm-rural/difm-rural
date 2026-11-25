// Shared encoder for transactional email. Caller-supplied text is escaped
// before it is placed in HTML. There is no path that renders raw HTML.

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// NOTE — no click-through link, deliberately (parked July 2026).
// Two dead ends were tried and both are blocked:
//   1. A raw difmrural:// link — Outlook/Gmail refuse to linkify custom schemes,
//      so it renders completely inert.
//   2. An https bridge (the `open` function) that 302s to the scheme — Chrome
//      blocks server-initiated redirects to an external protocol (needs a user
//      gesture), so it dies on a blank page. Outlook Safe Links adds a hop too.
// A Supabase-hosted HTML tap-through page is also out: the edge gateway forces
// Content-Type: text/plain and a `sandbox` CSP, which neuters scripts/links.
// The real fix is Universal Links / App Links, which needs web hosting on
// ruralconnections.nz plus a native rebuild. The app-side handler and the
// `open` function are already written and waiting for that.
export function emailHtml(body, seasonal = false, logoUrl = '') {
  const safeBody = escapeHtml(body)
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="Rural Connections"
           style="display:block;width:48px;height:48px;border:0;border-radius:12px;margin:0 0 14px" />`
    : ''
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f6f4;font-family:Arial,sans-serif;color:#1f2923">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#fff;border:1px solid #e1e5e2;border-radius:14px;padding:28px">
        ${logo}
        <div style="font-size:13px;font-weight:700;letter-spacing:1.4px;color:#2d6a4f;margin-bottom:22px">RURAL CONNECTIONS</div>
        <p style="font-size:17px;line-height:1.55;margin:0 0 22px">${safeBody}</p>
        <p style="font-size:14px;line-height:1.5;color:#66736b;margin:0">${seasonal ? 'Open Rural Connections to get started.' : 'Open Rural Connections to view the details and respond.'}</p>
      </div>
      <p style="font-size:12px;line-height:1.5;color:#7a847e;text-align:center;margin:18px 0 0">You can manage ${seasonal ? 'seasonal reminders' : 'email updates'} in Account settings.</p>
    </div>
  </body>
</html>`
}

// Prefer the plain-text message. An HTML-only caller is kept working by
// treating that string as text: tags are escaped into the standard template
// and are never parsed as markup.
export function transactionalEmail({ text, html, seasonal = false, logoUrl = '' } = {}) {
  const message = String(text ?? '').trim() || String(html ?? '').trim()
  return { text: message, html: emailHtml(message, seasonal, logoUrl) }
}
