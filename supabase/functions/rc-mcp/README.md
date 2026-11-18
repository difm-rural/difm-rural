# rc-mcp: Rural Connections MCP server (phase 1, read-only)

A remote MCP server (Streamable HTTP) built on the Supabase MCP server block.
AI assistants connect through the **Supabase OAuth 2.1 server** (public beta)
and act **as the member**, so row-level security applies to every read.

| Tool | What it returns |
|---|---|
| `search_jobs` | open public jobs (`jobs_public`), up to 25 |
| `search_listings` | active listings (`services`), up to 25 |
| `get_job` | one job + the member's relationship and next move |
| `get_listing` | one listing |
| `my_activity` | the member's in-flight jobs/offers/bookings, with `shared/nextMove.ts` badges |
| `read_conversation` | up to 25 latest messages in a chat the member is part of |

Rules on top of RLS (all in `shared/aiConnector.ts`, tested by
`tests/ai-connector.test.mjs`): at most 25 results, towns/areas only (no
address, pin or polygon, and street addresses/coordinates in free text are
redacted), participant-only conversations and activity (even for admins).

Every call first runs `ai_begin_tool_call()` (migration
`20261118190000_ai_connector.sql`): it refuses revoked sessions, the global
`ai_settings.ai_enabled` switch, admin pauses (`ai_member_pauses`), and more
than 60 calls/minute or 1,000/day per member, and writes `ai_tool_calls`
(admins only).

## Turning it on (production steps, ask first)

1. `supabase db push`: `20261118190000_ai_connector.sql` is applied (2026-11-18) with `ai_enabled` OFF. `20261118200000_assistant_tokens_read_only.sql` must be applied BEFORE the OAuth server is enabled.
2. Dashboard → Authentication → **OAuth Server**: enable, authorization path
   `/oauth/consent`, allow dynamic client registration. The consent screen
   is provider-web's `/oauth/consent`, so the **Auth Site URL must be the
   provider-web origin** (it's appended to Site URL).
3. `supabase functions deploy rc-mcp` (`verify_jwt = false` is in config.toml;
   the function verifies tokens itself via JWKS).
4. In Claude: Settings → Connectors → Add custom connector →
   `https://opagkgfxmjqmnvhrcris.supabase.co/functions/v1/rc-mcp`.

## Running locally without Docker

Needs Deno (`winget install DenoLand.Deno`). From this folder:

```powershell
$env:SUPABASE_URL='https://opagkgfxmjqmnvhrcris.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='sb_publishable_…'
$env:SUPABASE_JWKS_URL='https://opagkgfxmjqmnvhrcris.supabase.co/auth/v1/.well-known/jwks.json'
$env:RC_MCP_RESOURCE_URL='http://localhost:8000'
deno check index.ts
deno run --allow-net --allow-env --allow-read index.ts
```

Then add `http://localhost:8000` as an HTTP MCP server in Claude Code
(`claude mcp add --transport http rural-connections http://localhost:8000`).
Claude.ai's custom connectors call from Anthropic's servers, so they need the
deployed (or tunnelled) URL, not localhost.

Live checks: `node --import ./tests/support/ts-resolve.mjs tests/ai-connector-live.mjs`.
