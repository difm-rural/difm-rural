// Read-only tools for the Rural Connections AI connector (the rc-mcp edge
// function). UI-free and runtime-free: every function takes a Supabase client
// that is already signed in as the member, so row-level security decides what
// they can see. The tools add three rules of their own on top of RLS:
//
//   * at most MAX_RESULTS rows per call;
//   * never an exact address, pin or polygon: only a coarse town/area, and
//     street addresses or coordinates inside free text are redacted;
//   * conversations and activity are limited to ones the member takes part in,
//     even for admins, whose RLS would otherwise let them read everyone's.
//
// Job reads go through jobs_public (CLAUDE.md, location privacy). No embeds of
// base jobs are used.
import { jobNextMove, bookingNextMove, type NextMove } from './nextMove.ts'
import { localityFromAddress } from './locality.ts'
import { CATEGORIES } from './categories.ts'

export const MAX_RESULTS = 25
export const DEFAULT_RESULTS = 10
export const CATEGORIES_HINT = CATEGORIES.join('; ')

export const AI_TOOL_NAMES = ['search_jobs', 'search_listings', 'get_job', 'get_listing', 'my_activity', 'read_conversation'] as const
export type AiToolName = typeof AI_TOOL_NAMES[number]

// The minimum of supabase-js these tools use, so tests can pass a fake.
// deno-lint-ignore no-explicit-any
type Query = any
export type SupabaseLike = { from(table: string): Query }

export class ToolInputError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JOB_ACTIVE = ['open', 'accepted']
const BOOKING_ACTIVE = ['pending', 'quote_sent', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested']

export function clampLimit(value: unknown, fallback = DEFAULT_RESULTS): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, MAX_RESULTS)
}

export function requireUuid(value: unknown, label = 'id'): string {
  const text = String(value ?? '').trim()
  if (!UUID.test(text)) throw new ToolInputError(`${label} must be a Rural Connections id (a UUID).`)
  return text.toLowerCase()
}

// Free-text search terms go inside a PostgREST or=() filter, where commas,
// parentheses, quotes and wildcards have meaning. Keep letters, digits,
// spaces and a little punctuation only.
export function searchTerm(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N} '’\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

const ROAD = '(?:road|rd|street|st|avenue|ave|lane|ln|drive|dr|highway|hwy|place|pl|crescent|cres|terrace|tce|close|court|ct|parade|grove|boulevard|blvd|quay|esplanade|way|row|mews|track|valley road)'
const STREET_ADDRESS = new RegExp(String.raw`\b\d{1,5}[a-z]?(?:\s*[/-]\s*\d{1,5}[a-z]?)?\s+(?:[\p{L}'’.-]+\s+){0,4}${ROAD}\b\.?`, 'giu')
const RAPID_NUMBER = /\b(?:rapid|rural\s+delivery|rd)\s*(?:no\.?|number|#)?\s*\d{1,5}\b/giu
const COORDINATES = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g
const MAP_LINK = /\bhttps?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com|what3words\.com|w3w\.co)\S*/giu

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
// NZ bank account: bank (2) branch (4) account (7, sometimes 8) suffix (2-3),
// with dashes, spaces, dots or nothing between the parts.
const BANK_ACCOUNT = /(?<![\w$-])\d{2}[\s.-]?\d{4}[\s.-]?\d{7,8}[\s.-]?\d{2,3}(?![\w-])/g
// NZ phone numbers: mobiles (02x), landlines (03-09), 0800/0508, and +64 / 0064
// forms, with optional brackets around the area code.
const PHONE = /(?<![\w$-])(?:(?:\+64|0064)[\s.-]?\(?0?|\(?0)(?:2\d|[3-79])\)?[\s.-]?\d{3,4}[\s.-]?\d{3,5}(?![\w-])/g
const FREEPHONE = /(?<![\w$-])0(?:800|508)[\s.-]?\d{3}[\s.-]?\d{3,4}(?![\w-])/g

// Remove anything private from free text (descriptions, chat) before it leaves
// Rural Connections: what pinpoints a property, and contact or bank details.
// Towns, regions, prices, dates and ids stay.
export function redactPrivate(text: unknown): string {
  return String(text ?? '')
    .replace(MAP_LINK, '[map link removed]')
    .replace(EMAIL, '[email removed]')
    .replace(COORDINATES, '[location removed]')
    .replace(BANK_ACCOUNT, '[bank account removed]')
    .replace(FREEPHONE, '[phone removed]')
    .replace(PHONE, '[phone removed]')
    .replace(STREET_ADDRESS, '[address removed]')
    .replace(RAPID_NUMBER, '[address removed]')
}
// Older name, kept for callers and tests.
export const redactAddresses = redactPrivate

// Messages posted by confirm_job / set_job_payment_method carry how to pay
// (often bank details, in the provider's own words too). Only their kind ever
// leaves RC: "Payment details sent (bank transfer)".
const PAYMENT_LINE = /^Payment: (?:\$[\d,]+(?:\.\d{2})?(?:\/hr|\/unit| est\.)? )?(by bank transfer|cash on the day|by invoice|as agreed)\s*$/m
const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'bank transfer', cash: 'cash on the day', invoice: 'invoice', agreed: 'as agreed',
  'by bank transfer': 'bank transfer', 'cash on the day': 'cash on the day', 'by invoice': 'invoice', 'as agreed': 'as agreed',
}

export function paymentMessageSummary(content: unknown, knownMethod?: string | null): string | null {
  const line = PAYMENT_LINE.exec(String(content ?? ''))
  const method = knownMethod ?? line?.[1] ?? null
  if (!knownMethod && !line) return null
  return `Payment details sent (${PAYMENT_LABELS[String(method)] || 'payment method shared'})`
}

function clip(text: unknown, max: number): string | null {
  const value = redactPrivate(text).trim()
  if (!value) return null
  return value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value
}

// A category from the shared taxonomy (any case), else the trimmed text as an
// exact match. Used with .eq(), so '&' and ',' in names need no escaping.
export function categoryFilter(value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return CATEGORIES.find(c => c.toLowerCase() === text.toLowerCase()) || text
}

// A job's public area: the requester's chosen public town, else the town part
// of the address (never the street). Hidden jobs only ever have location_area.
export function jobArea(row: { location_area?: string | null; location_name?: string | null }): string | null {
  return clip(row.location_area, 120) || localityFromAddress(row.location_name) || null
}

export function listingArea(row: { location_name?: string | null }): string | null {
  return localityFromAddress(row.location_name) || null
}

function firstName(name: unknown): string | null {
  const value = String(name ?? '').trim()
  return value ? value.split(/\s+/)[0] : null
}

function money(value: unknown): number | null {
  const n = Number(value)
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? null : n
}

type JobRow = Record<string, unknown> & { id: string; requester_id?: string }
type ListingRow = Record<string, unknown> & { id: string; provider_id?: string }

const JOB_COLUMNS = 'id,requester_id,title,description,category,price_type,price,status,visibility,location_area,location_name,schedule_type,scheduled_date,date_from,date_to,created_at'
const LISTING_COLUMNS = 'id,provider_id,title,description,category,kind,pricing_type,rate,unit_label,min_charge,minimum_units,travel_range_km,location_name,includes_equipment,availability,payment_timing,is_active,closed_at,created_at'

export function jobSummary(row: JobRow) {
  return {
    id: row.id,
    title: clip(row.title, 140),
    category: row.category ?? null,
    status: row.status ?? null,
    price_type: row.price_type ?? null,
    price_nzd: money(row.price),
    area: jobArea(row as { location_area?: string; location_name?: string }),
    dates: { from: row.date_from ?? null, to: row.date_to ?? null, scheduled: row.scheduled_date ?? null, type: row.schedule_type ?? null },
    posted_at: row.created_at ?? null,
  }
}

export function listingSummary(row: ListingRow, providerName?: string | null) {
  return {
    id: row.id,
    title: clip(row.title, 140),
    category: row.category ?? null,
    kind: row.kind ?? null,
    pricing_type: row.pricing_type ?? null,
    rate_nzd: money(row.rate),
    unit: row.unit_label ?? null,
    min_charge_nzd: money(row.min_charge),
    area: listingArea(row as { location_name?: string }),
    travel_range_km: money(row.travel_range_km),
    provider: providerName === undefined ? undefined : firstName(providerName),
    listed_at: row.created_at ?? null,
  }
}

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

async function publicNames(client: SupabaseLike, ids: unknown[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))].slice(0, 200)
  if (!unique.length) return new Map()
  const rows = check<{ id: string; full_name: string | null; display_name: string | null }[]>(
    await client.from('profiles_public').select('id,full_name,display_name').in('id', unique),
  ) || []
  return new Map(rows.map(r => [r.id, String(r.display_name || r.full_name || '').trim()]))
}

// ---------------------------------------------------------------------------
// search_jobs / search_listings
// ---------------------------------------------------------------------------
export type SearchArgs = { query?: string; category?: string; area?: string; limit?: number }
export type Point = { latitude: number; longitude: number }
// Turns a town/area name into a point (the app's own place lookup, via the
// maps-proxy function). Null when the place can't be found.
export type AreaGeocoder = (area: string) => Promise<Point | null>
export type SearchOptions = { geocode?: AreaGeocoder }

export const JOB_RADIUS_KM = 30
// Listings without a travel range are treated as covering this far.
export const DEFAULT_LISTING_RANGE_KM = 30
// How many matching rows are scored in memory when an area or query is given.
const CANDIDATES = 300

const STOP_WORDS = new Set(['a', 'an', 'and', 'any', 'for', 'in', 'near', 'nearby', 'around', 'the', 'of', 'to', 'at', 'on', 'my', 'me', 'someone', 'somebody', 'who', 'can', 'need', 'needed', 'wanted', 'looking', 'job', 'jobs', 'work', 'listing', 'listings', 'service', 'services', 'provider', 'providers', 'help', 'local', 'nz', 'with', 'or'])

// Small synonym list: a stem -> extra stems that mean the same kind of work.
const SYNONYMS: Record<string, string[]> = {
  fenc: ['gate', 'post and rail'],
  gate: ['fenc'],
  spray: ['weed', 'pest control'],
  weed: ['spray'],
  mow: ['lawn', 'grass'],
  lawn: ['mow', 'grass'],
  dig: ['excavat', 'earthwork'],
  excavat: ['digger', 'earthwork'],
  drain: ['culvert'],
  hay: ['bale', 'baleage', 'silage'],
  graz: ['paddock', 'pasture'],
  paddock: ['graz', 'pasture'],
  septic: ['wastewater', 'sewage'],
  firewood: ['wood', 'logs'],
  tree: ['arborist', 'hedge', 'felling'],
  hedge: ['trim', 'tree'],
  drone: ['spray', 'aerial'],
  plumb: ['pipe'],
  electric: ['wiring'],
  shed: ['build'],
  sit: ['feed', 'care'],
  driveway: ['gravel', 'metal', 'earthwork'],
  gravel: ['metal', 'driveway'],
}

// fence/fencer/fencing -> fenc; spray/spraying/sprayer -> spray; digging -> dig.
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/['’]/g, '')
  for (const suffix of ['ings', 'ing', 'ers', 'er', 'ies', 'es', 'ed', 's']) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length) + (suffix === 'ies' ? 'y' : '')
      break
    }
  }
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1)
  // doubled consonant left by -ing/-er (digging -> digg -> dig)
  if (w.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(w)) w = w.slice(0, -1)
  return w
}

// The query as word groups: each group is one meaningful word expanded to its
// stem and synonyms. A row matches a group if any form appears in its title,
// description or category.
export function queryTerms(value: unknown): string[][] {
  const words = searchTerm(value).toLowerCase().split(/\s+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w))
  const groups: string[][] = []
  for (const word of [...new Set(words)].slice(0, 6)) {
    const root = stem(word)
    if (root.length < 3) continue
    groups.push([...new Set([root, ...(SYNONYMS[root] || [])])].map(t => searchTerm(t)).filter(Boolean))
  }
  return groups
}

function textFilter(groups: string[][], columns: string[]): string | null {
  const terms = [...new Set(groups.flat())].slice(0, 24)
  if (!terms.length) return null
  return terms.flatMap(t => columns.map(c => `${c}.ilike.*${t}*`)).join(',')
}

// Rows matching more of the query's words rank first.
function wordScore(row: Record<string, unknown>, groups: string[][]): number {
  if (!groups.length) return 0
  const text = [row.title, row.description, row.category, row.card_headline].map(v => String(v ?? '')).join(' ').toLowerCase()
  return groups.filter(g => g.some(t => text.includes(t.toLowerCase()))).length
}

function pointOf(lat: unknown, lng: unknown): Point | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === '' || lng === '') return null
  const latitude = Number(lat), longitude = Number(lng)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null
}

export function distanceKm(a: Point, b: Point): number {
  const r = Math.PI / 180, dlat = (b.latitude - a.latitude) * r, dlng = (b.longitude - a.longitude) * r
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dlng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
}

// Whole kilometres, never 0: enough to compare, not enough to pinpoint.
const roundKm = (km: number) => Math.max(1, Math.round(km))

async function resolveArea(area: string, geocode?: AreaGeocoder): Promise<Point | null> {
  if (!area || !geocode) return null
  try { return await geocode(area) } catch { return null }
}

type Located<T> = { row: T; km: number; score: number }

function byScoreThenDistance<T>(a: Located<T>, b: Located<T>) {
  return b.score - a.score || a.km - b.km
}

function withHint<T extends Record<string, unknown>>(result: T, hint: string | null): T & { hint?: string } {
  return hint ? { ...result, hint } : result
}

function describeFilters(args: SearchArgs, category: string): string {
  return [args.query && `"${searchTerm(args.query)}"`, category].filter(Boolean).join(' in ')
}

// "fencer near Waitoki" in the query with no area: treat Waitoki as the area.
export function splitQueryArea(args: SearchArgs): SearchArgs {
  if (searchTerm(args.area) || typeof args.query !== 'string') return args
  const m = /^(.*?)\s+(?:near|in|around|at|close to)\s+([\p{L}\p{M}'’ -]{3,60})$/iu.exec(args.query.trim())
  return m && m[1].trim() ? { ...args, query: m[1].trim(), area: m[2].trim() } : args
}

export async function searchJobs(client: SupabaseLike, input: SearchArgs = {}, options: SearchOptions = {}) {
  const args = splitQueryArea(input)
  const limit = clampLimit(args.limit)
  const groups = queryTerms(args.query)
  const category = categoryFilter(args.category)
  const area = searchTerm(args.area)
  const base = () => {
    let q = client.from('jobs_public').select(JOB_COLUMNS + ',latitude,longitude').eq('status', 'open').eq('visibility', 'public')
    const filter = textFilter(groups, ['title', 'description', 'category'])
    if (filter) q = q.or(filter)
    if (category) q = q.eq('category', category)
    return q
  }
  const centre = await resolveArea(area, options.geocode)

  if (area && !centre) {
    const rows = check<JobRow[]>(await base().ilike('location_area', `*${area}*`).order('created_at', { ascending: false }).limit(limit)) || []
    rows.sort((a, b) => wordScore(b, groups) - wordScore(a, groups))
    return withHint({
      results: rows.slice(0, limit).map(jobSummary), count: Math.min(rows.length, limit), limit,
      area_match: 'text',
      area_note: `Couldn't find "${area}" as a New Zealand place, so this matched the job's public area text instead.`,
    }, rows.length ? null : `No open jobs mention "${area}". Try a nearby town or leave the area out.`)
  }

  if (!centre) {
    const rows = check<JobRow[]>(await base().order('created_at', { ascending: false }).limit(groups.length ? CANDIDATES : limit)) || []
    rows.sort((a, b) => wordScore(b, groups) - wordScore(a, groups))
    return withHint({ results: rows.slice(0, limit).map(jobSummary), count: Math.min(rows.length, limit), limit },
      rows.length ? null : await jobsElsewhereHint(client, args, groups, category))
  }

  const rows = check<(JobRow & { latitude?: unknown; longitude?: unknown })[]>(await base().order('created_at', { ascending: false }).limit(CANDIDATES)) || []
  // Hidden-address jobs have no pin in jobs_public: use their public area's centre.
  const located: Located<JobRow>[] = []
  await Promise.all(rows.map(async row => {
    const point = pointOf(row.latitude, row.longitude) || (row.location_area ? await resolveArea(String(row.location_area), options.geocode) : null)
    if (point) located.push({ row, km: distanceKm(centre, point), score: wordScore(row, groups) })
  }))
  const near = located.filter(x => x.km <= JOB_RADIUS_KM).sort(byScoreThenDistance)
  const results = near.slice(0, limit).map(x => ({ ...jobSummary(x.row), distance_km: roundKm(x.km) }))
  let hint: string | null = null
  if (!near.length) {
    const nearest = [...located].sort((a, b) => a.km - b.km)[0]
    hint = nearest
      ? `No matching open jobs within ${JOB_RADIUS_KM} km of ${area}. ${located.length} matching job${located.length === 1 ? '' : 's'} elsewhere; the nearest is "${clip(nearest.row.title, 80)}" in ${jobArea(nearest.row as { location_area?: string; location_name?: string }) || 'another area'}, about ${roundKm(nearest.km)} km away.`
      : await jobsElsewhereHint(client, args, groups, category)
  }
  return withHint({ results, count: results.length, limit, area_match: 'distance', radius_km: JOB_RADIUS_KM, area }, hint)
}

async function jobsElsewhereHint(client: SupabaseLike, args: SearchArgs, groups: string[][], category: string): Promise<string> {
  if (!groups.length && !category) return 'There are no open public jobs right now.'
  const any = check<{ id: string }[]>(await client.from('jobs_public').select('id').eq('status', 'open').eq('visibility', 'public').limit(1)) || []
  return any.length
    ? `No open jobs match ${describeFilters(args, category)}. Try a broader word or leave the category out.`
    : 'There are no open public jobs right now.'
}

export async function searchListings(client: SupabaseLike, input: SearchArgs = {}, options: SearchOptions = {}) {
  const args = splitQueryArea(input)
  const limit = clampLimit(args.limit)
  const groups = queryTerms(args.query)
  const category = categoryFilter(args.category)
  const area = searchTerm(args.area)
  const base = () => {
    let q = client.from('services').select(LISTING_COLUMNS + ',card_headline,latitude,longitude,service_latitude,service_longitude').eq('is_active', true).is('closed_at', null)
    const filter = textFilter(groups, ['title', 'description', 'category', 'card_headline'])
    if (filter) q = q.or(filter)
    if (category) q = q.eq('category', category)
    return q
  }
  const summarise = async (items: { row: ListingRow; extra?: Record<string, unknown> }[]) => {
    const names = await publicNames(client, items.map(i => i.row.provider_id))
    return items.map(i => ({ ...listingSummary(i.row, names.get(String(i.row.provider_id)) || null), ...(i.extra || {}) }))
  }
  const centre = await resolveArea(area, options.geocode)

  if (area && !centre) {
    const rows = check<ListingRow[]>(await base().ilike('location_name', `*${area}*`).order('created_at', { ascending: false }).limit(limit)) || []
    rows.sort((a, b) => wordScore(b, groups) - wordScore(a, groups))
    return withHint({
      results: await summarise(rows.slice(0, limit).map(row => ({ row }))), count: Math.min(rows.length, limit), limit,
      area_match: 'text',
      area_note: `Couldn't find "${area}" as a New Zealand place, so this matched the listing's town text instead.`,
    }, rows.length ? null : `No listings mention "${area}". Try a nearby town or leave the area out.`)
  }

  if (!centre) {
    const rows = check<ListingRow[]>(await base().order('created_at', { ascending: false }).limit(groups.length ? CANDIDATES : limit)) || []
    rows.sort((a, b) => wordScore(b, groups) - wordScore(a, groups))
    return withHint({ results: await summarise(rows.slice(0, limit).map(row => ({ row }))), count: Math.min(rows.length, limit), limit },
      rows.length ? null : listingsElsewhereHint(args, groups, category, 0))
  }

  const rows = check<ListingRow[]>(await base().order('created_at', { ascending: false }).limit(CANDIDATES)) || []
  const located: (Located<ListingRow> & { range: number })[] = []
  for (const row of rows) {
    const point = pointOf(row.latitude, row.longitude) || pointOf(row.service_latitude, row.service_longitude)
    if (!point) continue
    const range = money(row.travel_range_km) ?? DEFAULT_LISTING_RANGE_KM
    located.push({ row, km: distanceKm(centre, point), range, score: wordScore(row, groups) })
  }
  const covering = located.filter(x => x.km <= x.range).sort(byScoreThenDistance)
  const results = await summarise(covering.slice(0, limit).map(x => ({ row: x.row, extra: { distance_km: roundKm(x.km), covers_area: true } })))
  let hint: string | null = null
  if (!covering.length) {
    const nearest = [...located].sort((a, b) => a.km - b.km)[0]
    hint = nearest
      ? `No listings cover ${area}. ${located.length} matching listing${located.length === 1 ? '' : 's'} elsewhere; the nearest is "${clip(nearest.row.title, 80)}"${nearest.row.category ? ` (${nearest.row.category})` : ''} based in ${listingArea(nearest.row as { location_name?: string }) || 'another area'}, about ${roundKm(nearest.km)} km away, travelling up to ${roundKm(nearest.range)} km. The member could still ask them.`
      : listingsElsewhereHint(args, groups, category, rows.length)
  }
  return withHint({ results, count: results.length, limit, area_match: 'distance', area }, hint)
}

function listingsElsewhereHint(args: SearchArgs, groups: string[][], category: string, found: number): string {
  if (found) return 'Matching listings exist but none has a location, so distance could not be checked. Try without an area.'
  if (!groups.length && !category) return 'There are no active listings right now.'
  return `No active listings match ${describeFilters(args, category)}. Try a broader word, another category, or search jobs instead.`
}

// ---------------------------------------------------------------------------
// get_job / get_listing
// ---------------------------------------------------------------------------
export async function getJob(client: SupabaseLike, userId: string, args: { job_id?: string }) {
  const id = requireUuid(args.job_id, 'job_id')
  const job = check<JobRow | null>(await client.from('jobs_public').select(JOB_COLUMNS).eq('id', id).maybeSingle())
  if (!job) return { found: false as const, job_id: id }
  const isOwner = job.requester_id === userId
  const [myBids, names] = await Promise.all([
    client.from('bids').select('id,status,amount,created_at').eq('job_id', id).eq('provider_id', userId).limit(5),
    publicNames(client, [job.requester_id]),
  ])
  const mine = (check<{ status: string; amount: unknown; created_at: string }[]>(myBids) || [])
  let offerCount: number | null = null
  if (isOwner) {
    const offers = check<{ id: string }[]>(await client.from('bids').select('id').eq('job_id', id).eq('status', 'pending').limit(200)) || []
    offerCount = offers.length
  }
  const accepted = mine.find(b => b.status === 'accepted')
  const role = isOwner ? 'requester' : accepted ? 'accepted_provider' : mine.length ? 'offered' : 'viewer'
  const next = isOwner
    ? jobNextMove(job, 'requester', { bidCount: offerCount || 0 })
    : mine.length ? jobNextMove(job, 'provider', { otherName: names.get(String(job.requester_id)), hasPendingBid: mine.some(b => b.status === 'pending'), hasArrival: true }) : null
  return {
    found: true as const,
    job: {
      ...jobSummary(job),
      description: clip(job.description, 2000),
      requester: isOwner ? 'you' : firstName(names.get(String(job.requester_id))),
      your_role: role,
      your_offers: mine.map(b => ({ status: b.status, amount_nzd: money(b.amount), offered_at: b.created_at })),
      pending_offer_count: offerCount,
      next_move: next ? moveSummary(next) : null,
    },
  }
}

export async function getListing(client: SupabaseLike, args: { listing_id?: string }) {
  const id = requireUuid(args.listing_id, 'listing_id')
  const row = check<ListingRow | null>(await client.from('services').select(LISTING_COLUMNS).eq('id', id).maybeSingle())
  if (!row) return { found: false as const, listing_id: id }
  const names = await publicNames(client, [row.provider_id])
  return {
    found: true as const,
    listing: {
      ...listingSummary(row, names.get(String(row.provider_id)) || null),
      description: clip(row.description, 2000),
      includes_equipment: row.includes_equipment ?? null,
      minimum_units: money(row.minimum_units),
      availability: Array.isArray(row.availability) ? row.availability.slice(0, 14) : null,
      payment_timing: row.payment_timing ?? null,
      active: row.is_active === true && !row.closed_at,
    },
  }
}

// ---------------------------------------------------------------------------
// my_activity
// ---------------------------------------------------------------------------
function moveSummary(next: NextMove) {
  return { badge: next.badge, next_step: next.detail, needs_your_action: next.needsAction, action: next.actionLabel }
}

export type ActivityItem = {
  type: 'job' | 'booking'
  id: string
  title: string | null
  your_role: 'requester' | 'provider'
  status: string | null
  other_party: string | null
  area: string | null
  badge: string
  next_step: string
  needs_your_action: boolean
  action: string | null
  created_at: string | null
}

export async function myActivity(client: SupabaseLike, userId: string, args: { limit?: number; needs_action_only?: boolean } = {}) {
  const limit = clampLimit(args.limit, MAX_RESULTS)
  // Explicit participant filters, so an admin's wider RLS never widens this.
  const [ownJobs, requesterBookings, providerBookings, myBids] = await Promise.all([
    client.from('jobs_public').select(JOB_COLUMNS).eq('requester_id', userId).in('status', JOB_ACTIVE).order('created_at', { ascending: false }).limit(100),
    client.from('bookings').select('id,service_id,requester_id,provider_id,status,scheduled_date,pricing_snapshot,created_at').eq('requester_id', userId).in('status', BOOKING_ACTIVE).order('created_at', { ascending: false }).limit(100),
    client.from('bookings').select('id,service_id,requester_id,provider_id,status,scheduled_date,pricing_snapshot,created_at').eq('provider_id', userId).in('status', BOOKING_ACTIVE).order('created_at', { ascending: false }).limit(100),
    client.from('bids').select('id,job_id,status,payment_method,created_at').eq('provider_id', userId).in('status', ['pending', 'accepted']).order('created_at', { ascending: false }).limit(100),
  ])
  const jobs = check<JobRow[]>(ownJobs) || []
  const reqBookings = check<Record<string, string>[]>(requesterBookings) || []
  const provBookings = check<Record<string, string>[]>(providerBookings) || []
  const bids = check<{ id: string; job_id: string; status: string; payment_method: string | null; created_at: string }[]>(myBids) || []

  const jobIds = jobs.map(j => j.id)
  const bidJobIds = [...new Set(bids.map(b => b.job_id))]
  const serviceIds = [...new Set([...reqBookings, ...provBookings].map(b => b.service_id).filter(Boolean))]
  const awardedIds = jobs.filter(j => j.status === 'accepted').map(j => j.id)
  const empty = Promise.resolve({ data: [], error: null })
  const [pendingOffers, questions, providerJobs, services, awarded] = await Promise.all([
    jobIds.length ? client.from('bids').select('job_id').in('job_id', jobIds).eq('status', 'pending').limit(1000) : empty,
    jobIds.length ? client.from('job_questions').select('job_id').in('job_id', jobIds).is('answer', null).limit(1000) : empty,
    bidJobIds.length ? client.from('jobs_public').select(JOB_COLUMNS).in('id', bidJobIds) : empty,
    serviceIds.length ? client.from('services').select('id,title,kind,pricing_type').in('id', serviceIds) : empty,
    awardedIds.length ? client.from('bids').select('job_id,provider_id,payment_method').in('job_id', awardedIds).eq('status', 'accepted') : empty,
  ])
  const count = (rows: { job_id: string }[]) => rows.reduce((m, r) => m.set(r.job_id, (m.get(r.job_id) || 0) + 1), new Map<string, number>())
  const offerCounts = count(check<{ job_id: string }[]>(pendingOffers) || [])
  const questionCounts = count(check<{ job_id: string }[]>(questions) || [])
  const bidJobs = new Map((check<JobRow[]>(providerJobs) || []).map(j => [j.id, j]))
  const serviceMap = new Map((check<Record<string, string>[]>(services) || []).map(s => [s.id, s]))
  const awardedBy = new Map((check<{ job_id: string; provider_id: string; payment_method: string | null }[]>(awarded) || []).map(b => [b.job_id, b]))
  const names = await publicNames(client, [
    ...[...awardedBy.values()].map(b => b.provider_id),
    ...[...bidJobs.values()].map(j => j.requester_id),
    ...reqBookings.map(b => b.provider_id),
    ...provBookings.map(b => b.requester_id),
  ])

  const items: ActivityItem[] = []
  const push = (type: ActivityItem['type'], row: Record<string, unknown>, role: ActivityItem['your_role'], title: unknown, other: string | null | undefined, next: NextMove | null, area: string | null) => {
    if (!next) return
    items.push({
      type, id: String(row.id), title: clip(title, 140), your_role: role, status: (row.status as string) ?? null,
      other_party: firstName(other), area, ...moveSummary(next), created_at: (row.created_at as string) ?? null,
    })
  }

  for (const job of jobs) {
    const award = awardedBy.get(job.id)
    push('job', job, 'requester', job.title, award ? names.get(award.provider_id) : null, jobNextMove(job, 'requester', {
      otherName: award ? names.get(award.provider_id) : null,
      bidCount: offerCounts.get(job.id) || 0,
      unansweredQuestionCount: questionCounts.get(job.id) || 0,
      paymentMethod: award?.payment_method ?? null,
    }), jobArea(job as { location_area?: string; location_name?: string }))
  }
  for (const bid of bids) {
    const job = bidJobs.get(bid.job_id)
    if (!job) continue
    if (bid.status === 'pending' && job.status !== 'open') continue
    if (bid.status === 'accepted' && job.status !== 'accepted') continue
    push('job', job, 'provider', job.title, names.get(String(job.requester_id)), jobNextMove(job, 'provider', {
      otherName: names.get(String(job.requester_id)),
      hasPendingBid: bid.status === 'pending',
      paymentMethod: bid.payment_method,
    }), jobArea(job as { location_area?: string; location_name?: string }))
  }
  for (const [role, list] of [['requester', reqBookings], ['provider', provBookings]] as const) {
    for (const booking of list) {
      const service = serviceMap.get(booking.service_id) || null
      const other = role === 'requester' ? booking.provider_id : booking.requester_id
      push('booking', booking, role, service?.title || 'Service booking', names.get(other),
        bookingNextMove({ ...booking, service } as never, role, { otherName: names.get(other) }), null)
    }
  }

  const filtered = args.needs_action_only ? items.filter(i => i.needs_your_action) : items
  filtered.sort((a, b) => Number(b.needs_your_action) - Number(a.needs_your_action) || String(b.created_at).localeCompare(String(a.created_at)))
  return {
    results: filtered.slice(0, limit),
    count: Math.min(filtered.length, limit),
    total_in_flight: filtered.length,
    limit,
  }
}

// ---------------------------------------------------------------------------
// read_conversation
// ---------------------------------------------------------------------------
export type ConversationArgs = { kind?: string; id?: string; other_member_id?: string; limit?: number }

type MessageRow = { id: string; sender_id: string; receiver_id: string; content: string | null; created_at: string }

export async function readConversation(client: SupabaseLike, userId: string, args: ConversationArgs) {
  const kind = String(args.kind || '').trim()
  if (!['job', 'booking', 'listing'].includes(kind)) throw new ToolInputError('kind must be "job", "booking" or "listing".')
  const id = requireUuid(args.id, 'id')
  const other = args.other_member_id ? requireUuid(args.other_member_id, 'other_member_id') : null
  const limit = clampLimit(args.limit, MAX_RESULTS)
  const participant = `sender_id.eq.${userId},receiver_id.eq.${userId}`

  let rows: MessageRow[]
  const paymentMessages = new Map<string, string | null>()
  let title: string | null = null
  if (kind === 'booking') {
    const booking = check<{ id: string; requester_id: string; provider_id: string; service_id: string } | null>(
      await client.from('bookings').select('id,requester_id,provider_id,service_id').eq('id', id)
        .or(`requester_id.eq.${userId},provider_id.eq.${userId}`).maybeSingle(),
    )
    if (!booking) return { found: false as const, kind, id }
    const service = check<{ title: string } | null>(await client.from('services').select('title').eq('id', booking.service_id).maybeSingle())
    title = service?.title ?? null
    rows = check<MessageRow[]>(await client.from('service_booking_messages').select('id,sender_id,receiver_id,content,created_at')
      .eq('booking_id', id).or(participant).order('created_at', { ascending: false }).limit(limit)) || []
  } else {
    const column = kind === 'job' ? 'job_id' : 'service_id'
    let q = client.from('messages').select('id,sender_id,receiver_id,content,created_at').eq(column, id)
    if (other) q = q.or(`and(sender_id.eq.${userId},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${userId})`)
    else q = q.or(participant)
    rows = check<MessageRow[]>(await q.order('created_at', { ascending: false }).limit(limit)) || []
    if (kind === 'job') {
      const job = check<{ title: string } | null>(await client.from('jobs_public').select('title').eq('id', id).maybeSingle())
      title = job?.title ?? null
      // Payment messages this job's offers point at (latest per offer).
      const paid = check<{ payment_message_id: string | null; payment_method: string | null }[]>(
        await client.from('bids').select('payment_message_id,payment_method').eq('job_id', id).not('payment_message_id', 'is', null),
      ) || []
      for (const b of paid) if (b.payment_message_id) paymentMessages.set(b.payment_message_id, b.payment_method)
    } else {
      const listing = check<{ title: string } | null>(await client.from('services').select('title').eq('id', id).maybeSingle())
      title = listing?.title ?? null
    }
  }
  // Belt and braces: drop anything the member is not a party to.
  rows = rows.filter(r => r.sender_id === userId || r.receiver_id === userId).slice(0, limit)
  if (!rows.length) return { found: false as const, kind, id }
  const people = new Set(rows.map(r => (r.sender_id === userId ? r.receiver_id : r.sender_id)))
  const names = await publicNames(client, [...people])
  return {
    found: true as const,
    kind,
    id,
    title: clip(title, 140),
    with: [...people].map(p => firstName(names.get(p)) || 'Member'),
    messages: rows.reverse().map(r => ({
      from: r.sender_id === userId ? 'you' : firstName(names.get(r.sender_id)) || 'Member',
      at: r.created_at,
      // Payment messages are summarised by id (bids.payment_message_id) or by
      // the fixed "Payment: … by bank transfer" line, which also catches older
      // re-sent ones; their body never leaves RC.
      text: (paymentMessages.has(r.id)
        ? paymentMessageSummary(r.content, paymentMessages.get(r.id))
        : paymentMessageSummary(r.content)) ?? clip(r.content, 2000) ?? '',
    })),
    note: rows.length >= limit ? `Showing the latest ${limit} messages.` : undefined,
  }
}

export function countResults(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  const v = value as Record<string, unknown>
  if (Array.isArray(v.results)) return v.results.length
  if (Array.isArray(v.messages)) return v.messages.length
  return v.found === false ? 0 : 1
}

// ---------------------------------------------------------------------------
// Gate: every tool call is checked and audited by ai_begin_tool_call (rate
// limits, global switch, member pause, revoked session) before it runs.
// ---------------------------------------------------------------------------
export type GateDecision = { allowed: boolean; reason: string; call_id: number | null; retry_after_seconds: number | null }
export type RpcLike = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

export function gateMessage(reason: string, retryAfter?: number | null): string {
  switch (reason) {
    case 'denied_minute': return `Rate limit reached: at most 60 Rural Connections tool calls a minute. Try again in about ${retryAfter || 60} seconds.`
    case 'denied_day': return 'Daily limit reached: at most 1,000 Rural Connections tool calls a day. Try again tomorrow.'
    case 'denied_paused': return 'Rural Connections has paused AI assistant access for this account. The member can contact Rural Connections support.'
    case 'denied_disabled': return 'AI assistant access to Rural Connections is turned off right now. Try again later.'
    case 'denied_session': return 'This connection to Rural Connections has been disconnected or has expired. Reconnect the assistant to continue.'
    default: return 'Rural Connections could not check this request. Try again shortly.'
  }
}

export type GatedOutcome =
  | { ok: true; value: unknown }
  | { ok: false; message: string; reason: string }

export async function runGatedTool(
  client: RpcLike,
  tool: AiToolName,
  run: () => Promise<unknown>,
  now: () => number = Date.now,
): Promise<GatedOutcome> {
  const started = now()
  const { data, error } = await client.rpc('ai_begin_tool_call', { p_tool: tool })
  const decision = data as GateDecision | null
  if (error || !decision || typeof decision.allowed !== 'boolean') return { ok: false, reason: 'gate_error', message: gateMessage('gate_error') }
  if (!decision.allowed) return { ok: false, reason: decision.reason, message: gateMessage(decision.reason, decision.retry_after_seconds) }
  const finish = (ok: boolean, count: number | null) =>
    Promise.resolve(client.rpc('ai_finish_tool_call', { p_call_id: decision.call_id, p_ok: ok, p_result_count: count, p_duration_ms: Math.max(0, Math.round(now() - started)) }))
      .then(() => undefined, () => undefined)
  try {
    const value = await run()
    await finish(true, countResults(value))
    return { ok: true, value }
  } catch (err) {
    await finish(false, null)
    if (err instanceof ToolInputError) return { ok: false, reason: 'input', message: err.message }
    return { ok: false, reason: 'error', message: 'Rural Connections could not read that just now. Try again shortly.' }
  }
}
