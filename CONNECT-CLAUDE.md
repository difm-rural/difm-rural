# Connect Claude to Rural Connections (hidden beta)

The Rural Connections connector lets Claude **search** jobs and listings and
**read** your own activity and conversations. It cannot post, offer, book,
message or change anything, and it never sees exact addresses: towns and
areas only.

Who can use it is set in admin-web → **AI assistants**. With the global switch
**off**, only accounts on the beta list can (your account is on it). With it
**on**, every member can. Paused members are always refused.

## 1. Add the connector in Claude

On claude.ai (Free, Pro, Max): **Customize → Connectors → Add → Add custom connector**.
On a Team or Enterprise plan, an Owner adds it under **Organization settings →
Connectors → Add → Custom**. Members then click **Connect** under
**Customize → Connectors**.

| Field | Value |
|---|---|
| Name | `Rural Connections` |
| MCP server URL | `https://opagkgfxmjqmnvhrcris.supabase.co/functions/v1/rc-mcp` |
| Authentication | **Sign in now** (or keep whatever Claude marks **Detected**) |
| OAuth client | **Register automatically**. Our auth server supports Dynamic Client Registration, not "Claude's published identity". Leave client ID and secret blank. |
| Request headers / Transport | leave empty / default |

Click **Continue**, then **Add**, then **Connect**. The connector also works in
the Claude desktop and mobile apps once it's added to your account.

## 2. What you should see

1. A browser tab opens on **dev.ruralconnections.nz**. If you're not signed in
   to the web console, you get the usual Rural Connections sign-in first
   (email code or password). It then returns you to the consent screen.
2. The consent screen (left panel: "Connect an AI assistant") shows:
   - **Allow Claude?** The name is whatever the app registered itself as, usually "Claude".
   - "**Claude** wants to **search Rural Connections and read your activity**."
   - A list: search open jobs and active listings; read your jobs, offers,
     bookings and whose turn it is; read your conversations; towns and areas
     only, never exact addresses.
   - "Signed in as *your email* · returns to **claude.ai**". Check that it says claude.ai.
   - **Deny** and **Allow** buttons.
3. Click **Allow**. You're sent back to Claude and the connector shows as
   connected, with six tools: `search_jobs`, `search_listings`, `get_job`,
   `get_listing`, `my_activity`, `read_conversation`.

If the screen says "This request can't be used", the request expired. Start
**Connect** again from Claude.

## 3. Try it

In a new chat, click **+ → Connectors** and make sure **Rural Connections** is on.

1. "What needs my attention on Rural Connections right now?"
   (`my_activity`: your jobs, offers and bookings, with whose turn it is.)
2. "Find open fencing jobs on Rural Connections near Waitoki and list them with prices."
   (`search_jobs`, then `get_job` for details.)
3. "Summarise my latest Rural Connections conversation about [job title] and tell me what I still need to reply to."
   (`my_activity` / `get_job` to find it, then `read_conversation`.)

Claude asks before each tool call unless you choose **Always allow**.

## 4. Limits, off switches and disconnecting

- 60 tool calls a minute and 1,000 a day per member. Claude is told when a limit is hit.
- **Disconnect:** Account → **Connected assistants** (web console or app; visible
  to beta members and anyone with an assistant connected), or remove the
  connector in Claude. Disconnecting ends the assistant's access immediately.
- **Admin:** admin-web → **AI assistants** has the global switch, the beta
  list, per-member pause, and usage. Every call is logged in `ai_tool_calls`
  (admins only).
- Assistant tokens are read-only everywhere. The database refuses their
  writes, the Auth API refuses email/password/profile changes, and the
  OpenAI/Maps edge functions return 403.
