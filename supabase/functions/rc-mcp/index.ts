import 'jsr:@supabase/functions-js@2.108.2/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import { withOAuthProtectedResource, withSupabase, type SupabaseContext } from 'npm:@supabase/server@1'

import { registerTools } from './tools.ts'

// Rural Connections MCP server (phase 1: read-only), built on the Supabase MCP
// server block. One Edge Function, composed as a pipeline:
//
//   withOAuthProtectedResource  RFC 9728 metadata at /functions/v1/rc-mcp/oauth-protected-resource
//                               and the WWW-Authenticate challenge on 401, so
//                               MCP clients find the Supabase OAuth 2.1 server.
//   withSupabase                Verifies the member's access token (JWKS) and
//                               builds a client that calls Supabase AS that
//                               member, so row-level security applies.
//   handleMcp                   Streamable HTTP transport + the six tools.
//
// Each tool call also goes through ai_begin_tool_call (see tools.ts), which
// rejects revoked sessions, honours the admin switch and member pauses,
// enforces 60/min and 1,000/day, and writes the admin-only audit row.

const SERVER_INSTRUCTIONS =
  'Rural Connections is a New Zealand rural marketplace: requesters post jobs, providers make offers, ' +
  'and providers advertise listings (services) that members book. These tools are read-only and run as ' +
  'the signed-in member, so they only see what that member can see in the app. Results are capped at 25 ' +
  'per call and show towns or areas, never exact addresses. Use my_activity for "what needs my attention".'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

async function handleMcp(request: Request, ctx: SupabaseContext): Promise<Response> {
  const claims = ctx.jwtClaims as Record<string, unknown> | undefined
  const clientId = typeof claims?.client_id === 'string' ? claims.client_id : ''
  // Only tokens issued to an OAuth client (a connected assistant) are accepted,
  // so every audited call is attributable to one, and a member can disconnect it.
  if (!clientId) {
    return json(403, { error: 'oauth_client_required', message: 'Connect this assistant to Rural Connections with OAuth first.' })
  }

  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: 'rural-connections', version: '1.0.0' }, { instructions: SERVER_INSTRUCTIONS })
      registerTools(server, { supabase: ctx.supabase, userId: ctx.userClaims!.id })
      return server
    },
    { onerror: (error) => console.error(JSON.stringify({ fn: 'rc-mcp', error: String(error) })) },
  )
  return handler.fetch(request)
}

// Hosted on Supabase the public URLs are derived automatically. For a local run
// outside the edge runtime (deno run, see README.md), set RC_MCP_RESOURCE_URL to
// the URL clients call; the authorization server falls back to SUPABASE_URL.
const LOCAL_RESOURCE_URL = Deno.env.get('RC_MCP_RESOURCE_URL')?.trim()

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(LOCAL_RESOURCE_URL ? { resourceServer: LOCAL_RESOURCE_URL } : undefined), withSupabase({ auth: 'user', cors: { headers: CORS_HEADERS } })],
    (request, ctx) => handleMcp(request, ctx),
  ),
)
