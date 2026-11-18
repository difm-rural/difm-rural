// AI assistants connect through the Supabase OAuth 2.1 server and get member
// access tokens carrying a client_id claim. Phase 1 gives them read-only access
// through rc-mcp only, so functions that act as the member (or spend money on
// OpenAI / Google Maps) refuse those tokens outright.
//
// The payload is decoded without verifying the signature: this only ever
// refuses a request, it never grants anything. Gateway JWT verification (or the
// function's own getUser) still authenticates everything else.
export const ASSISTANT_READ_ONLY = 'AI assistants have read-only access'

export function isAssistantRequest(request: Request): boolean {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  const payload = token?.split('.')[1]
  if (!payload) return false
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')))
    return typeof json?.client_id === 'string' && json.client_id.length > 0
  } catch {
    return false
  }
}

export function refuseAssistantToken(request: Request, headers: HeadersInit = {}): Response | null {
  if (!isAssistantRequest(request)) return null
  return new Response(JSON.stringify({ error: 'assistant_read_only', message: ASSISTANT_READ_ONLY }), {
    status: 403,
    headers: { ...Object.fromEntries(new Headers(headers)), 'Content-Type': 'application/json' },
  })
}
