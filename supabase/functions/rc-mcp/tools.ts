import type { CallToolResult, McpServer } from 'npm:@modelcontextprotocol/server@2.0.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.108.2'
import { z } from 'npm:zod@4.4.3'

import {
  CATEGORIES_HINT, createPublicAreaCache, getJob, getListing, lookupPublicArea, myActivity, readConversation, runGatedTool,
  searchJobs, searchListings, MAX_RESULTS, type AiToolName, type AreaGeocoder,
} from './connector.ts'

// Town/area -> point, with the same place lookup the app uses (maps-proxy:
// Google Places restricted to NZ). Called as a guest (publishable key only):
// maps-proxy refuses assistant tokens, and the lookup needs no member data.
// Cached per isolate (24 h for hits, 1 min for misses).
const MAPS_PROXY = (Deno.env.get('SUPABASE_URL') || '') + '/functions/v1/maps-proxy'
const GUEST_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const geocode: AreaGeocoder = createPublicAreaCache(area =>
  lookupPublicArea(MAPS_PROXY, area, (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string> || {}), apikey: GUEST_KEY } })))

// Only the member-scoped client reaches the tools. There is deliberately no
// service-role client in this function, so nothing here can bypass RLS.
export type ToolContext = { supabase: SupabaseClient; userId: string }

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

function result(outcome: Awaited<ReturnType<typeof runGatedTool>>): CallToolResult {
  if (!outcome.ok) return { isError: true, content: [{ type: 'text', text: outcome.message }] }
  return {
    content: [{ type: 'text', text: JSON.stringify(outcome.value) }],
    structuredContent: outcome.value as Record<string, unknown>,
  }
}

const limit = z.number().int().min(1).max(MAX_RESULTS).optional()
  .describe(`How many results to return (1–${MAX_RESULTS}, default 10).`)
const search = {
  query: z.string().max(200).optional().describe('What kind of work, e.g. "fencer", "hay", "drone spraying". Put the place in area, not here.'),
  category: z.string().max(80).optional().describe(`Category name. One of: ${CATEGORIES_HINT}.`),
  area: z.string().max(120).optional().describe('A New Zealand town or locality, e.g. "Waitoki" or "Te Kūiti". Results are matched by distance from it.'),
  limit,
}

export function registerTools(server: McpServer, { supabase, userId }: ToolContext): void {
  const gated = (tool: AiToolName, run: () => Promise<unknown>) => runGatedTool(supabase, tool, run).then(result)

  server.registerTool('search_jobs', {
    title: 'Search open jobs',
    description: 'Search open jobs on the Rural Connections job board (work requesters want done). Words match title, description and category, including simple word forms (fence/fencer/fencing). With an area, returns jobs within 30 km of that town, nearest first, with distance_km. Up to 25 results, towns/areas only. If nothing matches, read the hint.',
    inputSchema: z.object(search),
    annotations: READ_ONLY,
  }, (args) => gated('search_jobs', () => searchJobs(supabase, args, { geocode })))

  server.registerTool('search_listings', {
    title: 'Search listings',
    description: 'Search active provider listings (services members can book, e.g. septic, drone spraying, fencing). Words match title, description and category, including simple word forms. With an area, returns listings whose travel range covers that town, nearest first, with distance_km. Up to 25 with pricing and the provider’s town. If nothing matches, read the hint.',
    inputSchema: z.object(search),
    annotations: READ_ONLY,
  }, (args) => gated('search_listings', () => searchListings(supabase, args, { geocode })))

  server.registerTool('get_job', {
    title: 'Get a job',
    description: 'Read one job by id: description, dates, price, public area, and the member’s own relationship to it (their job, their offer) with the next move.',
    inputSchema: z.object({ job_id: z.string().uuid().describe('The job id from search_jobs or my_activity.') }),
    annotations: READ_ONLY,
  }, (args) => gated('get_job', () => getJob(supabase, userId, args)))

  server.registerTool('get_listing', {
    title: 'Get a listing',
    description: 'Read one provider listing by id: description, pricing, availability, travel range and town.',
    inputSchema: z.object({ listing_id: z.string().uuid().describe('The listing id from search_listings.') }),
    annotations: READ_ONLY,
  }, (args) => gated('get_listing', () => getListing(supabase, args)))

  server.registerTool('my_activity', {
    title: 'My activity',
    description: 'Everything the member has in flight — their jobs, offers, jobs they are doing and bookings on either side — with whose turn it is and the next step. Items needing the member come first.',
    inputSchema: z.object({
      needs_action_only: z.boolean().optional().describe('Only items waiting on the member.'),
      limit,
    }),
    annotations: READ_ONLY,
  }, (args) => gated('my_activity', () => myActivity(supabase, userId, args)))

  server.registerTool('read_conversation', {
    title: 'Read a conversation',
    description: 'Read the latest messages (up to 25) in a conversation the member is part of: a job chat, a booking chat, or a listing enquiry. Addresses and map pins in messages are removed.',
    inputSchema: z.object({
      kind: z.enum(['job', 'booking', 'listing']).describe('"job" for a job chat, "booking" for a booking chat, "listing" for an enquiry about a listing.'),
      id: z.string().uuid().describe('The job, booking or listing id.'),
      other_member_id: z.string().uuid().optional().describe('For a job or listing with several conversations, the other person’s member id.'),
      limit,
    }),
    annotations: READ_ONLY,
  }, (args) => gated('read_conversation', () => readConversation(supabase, userId, args)))
}
