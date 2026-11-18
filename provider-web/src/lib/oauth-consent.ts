// Pure helpers for the OAuth consent screen (/oauth/consent) and the Connected
// assistants page. Supabase Auth's OAuth 2.1 server sends the member here with
// ?authorization_id=…; we sign them in if needed, then show Allow / Deny.
import { redirectHost } from '@shared/connectedAssistants'
export { assistantName, connectedAssistants, connectedSince, CONSENT_SUMMARY, redirectHost } from '@shared/connectedAssistants'

export const CONSENT_PATH = '/oauth/consent'

// Authorization ids are opaque, URL-safe tokens. Reject anything else before it
// reaches the Auth API or a redirect.
export function authorizationId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : ''
  return /^[A-Za-z0-9_-]{8,200}$/.test(id) ? id : null
}

export function consentPath(id: string): string {
  return CONSENT_PATH + '?authorization_id=' + encodeURIComponent(id)
}

export function loginPathForConsent(id: string): string {
  return '/login?next=' + encodeURIComponent(consentPath(id))
}

export function safeRedirect(value: unknown): string | null {
  return redirectHost(value) ? String(value) : null
}
