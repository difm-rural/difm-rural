// Proxies the Google Maps web APIs the app needs so the API key never ships
// in the app bundle. The key lives in the GOOGLE_MAPS_API_KEY function secret.
//
// Deployed with --no-verify-jwt because guests (no session) and React Native
// <Image> requests can't attach a Supabase JWT. A key shipped in the app could
// be extracted anyway, so the protections here are strict request shapes
// (fixed styling, capped sizes/zoom/point counts, NZ-only autocomplete) plus
// per-API quotas on the key in Google Cloud Console.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PATH_STYLE = 'color:0x2d6a4fff|weight:2|fillcolor:0x2d6a4f50'
const MAX_PATH_POINTS = 80

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseCoord(value: string | null, min: number, max: number): number | null {
  if (value === null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

// "lat,lng|lat,lng|..." → validated, polygon closed, or null if malformed
function parsePath(raw: string): string | null {
  const pairs = raw.split('|').filter(Boolean)
  if (pairs.length < 3 || pairs.length > MAX_PATH_POINTS) return null
  for (const pair of pairs) {
    const [lat, lng, extra] = pair.split(',')
    if (extra !== undefined) return null
    if (parseCoord(lat, -90, 90) === null || parseCoord(lng, -180, 180) === null) return null
  }
  if (pairs[pairs.length - 1] !== pairs[0]) pairs.push(pairs[0])
  return pairs.join('|')
}

async function handleStaticMap(url: URL, googleKey: string) {
  const zoom = clampInt(url.searchParams.get('zoom'), 14, 1, 20)
  const w = clampInt(url.searchParams.get('w'), 600, 50, 700)
  const h = clampInt(url.searchParams.get('h'), 240, 50, 500)

  const params = new URLSearchParams({ size: `${w}x${h}`, scale: '2', key: googleKey })

  const rawPath = url.searchParams.get('path')
  if (rawPath) {
    const path = parsePath(rawPath)
    if (!path) return jsonResponse({ error: 'Invalid path.' }, 400)
    const points = path.split('|').map(p => p.split(',').map(Number))
    const lat = points.reduce((sum, p) => sum + p[0], 0) / points.length
    const lng = points.reduce((sum, p) => sum + p[1], 0) / points.length
    params.set('center', `${lat},${lng}`)
    params.set('zoom', String(zoom))
    params.set('path', `${PATH_STYLE}|${path}`)
  } else {
    const lat = parseCoord(url.searchParams.get('lat'), -90, 90)
    const lng = parseCoord(url.searchParams.get('lng'), -180, 180)
    if (lat === null || lng === null) return jsonResponse({ error: 'lat and lng are required.' }, 400)
    params.set('center', `${lat},${lng}`)
    params.set('zoom', String(zoom))
    params.set('markers', `color:red|${lat},${lng}`)
  }

  const upstream = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params}`)
  if (!upstream.ok) {
    console.error('maps-proxy staticmap: upstream status', upstream.status)
    return jsonResponse({ error: 'Could not load map image.' }, 502)
  }
  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

async function handleGeocode(url: URL, googleKey: string) {
  const lat = parseCoord(url.searchParams.get('lat'), -90, 90)
  const lng = parseCoord(url.searchParams.get('lng'), -180, 180)
  if (lat === null || lng === null) return jsonResponse({ error: 'lat and lng are required.' }, 400)

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleKey}`
  )
  const data = await res.json()
  return jsonResponse({ address: data.results?.[0]?.formatted_address ?? null })
}

async function handleAutocomplete(req: Request, googleKey: string) {
  const body = await req.json().catch(() => null)
  const input = typeof body?.input === 'string' ? body.input.trim() : ''
  if (input.length < 3 || input.length > 120) {
    return jsonResponse({ suggestions: [] })
  }

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey },
    body: JSON.stringify({ input, includedRegionCodes: ['nz'], languageCode: 'en' }),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('maps-proxy autocomplete: upstream error', data?.error?.message || res.status)
    return jsonResponse({ suggestions: [] })
  }

  const suggestions = (data.suggestions ?? [])
    .map((s: Record<string, any>) => ({
      place_id: s.placePrediction?.placeId,
      description: s.placePrediction?.text?.text,
    }))
    .filter((p: Record<string, unknown>) => p.place_id && p.description)
  return jsonResponse({ suggestions })
}

async function handlePlaceDetails(url: URL, googleKey: string) {
  const placeId = url.searchParams.get('place_id') ?? ''
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(placeId)) {
    return jsonResponse({ error: 'Invalid place_id.' }, 400)
  }

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': googleKey,
      'X-Goog-FieldMask': 'location,formattedAddress,displayName',
    },
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('maps-proxy place-details: upstream error', data?.error?.message || res.status)
    return jsonResponse({ error: 'Could not load place details.' }, 502)
  }
  return jsonResponse({
    latitude: data.location?.latitude ?? null,
    longitude: data.location?.longitude ?? null,
    formattedAddress: data.formattedAddress ?? null,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!googleKey) {
    return jsonResponse({ error: 'GOOGLE_MAPS_API_KEY is not configured for this Supabase function.' }, 500)
  }

  const url = new URL(req.url)
  const route = url.pathname.split('/').filter(Boolean).pop()

  try {
    if (route === 'staticmap' && req.method === 'GET') return await handleStaticMap(url, googleKey)
    if (route === 'geocode' && req.method === 'GET') return await handleGeocode(url, googleKey)
    if (route === 'places-autocomplete' && req.method === 'POST') return await handleAutocomplete(req, googleKey)
    if (route === 'place-details' && req.method === 'GET') return await handlePlaceDetails(url, googleKey)
    return jsonResponse({ error: 'Not found.' }, 404)
  } catch (error) {
    console.error('maps-proxy: failed', error instanceof Error ? error.message : error)
    return jsonResponse({ error: 'Request failed.' }, 500)
  }
})
