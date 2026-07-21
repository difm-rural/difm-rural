const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const categories = [
  'Fencing & Gates',
  'Animals & Farm Sitting',
  'Water & Drainage',
  'Spraying & Pest Control',
  'Land & Vegetation',
  'Cropping, Hay & Feed',
  'Earthworks & Driveways',
  'Machinery & Repairs',
  'Buildings & Maintenance',
  'Transport & Delivery',
  'Property & House Sitting',
  'General Rural Help',
]

const systemPrompt = `
You extract rural service listing details from photos for Rural Connections.

Return JSON only with this shape:
{
  "title": string | null,
  "category": string | null,
  "short_description": string | null,
  "full_description": string | null,
  "service_area": string | null,
  "pricing_type": "hourly" | "fixed" | "per_day" | "per_load" | "per_job" | "quote_required" | "unknown",
  "price_amount": number | null,
  "pricing_notes": string | null,
  "availability": string | null,
  "equipment": string[],
  "tags": string[],
  "card_options": [
    {
      "label": string,
      "headline": string,
      "supporting_text": string,
      "style": "bold" | "bottom" | "clean"
    }
  ],
  "website_url": string | null,
  "contact_details_found": string[],
  "missing_fields": string[],
  "confidence_notes": string[]
}

Rules:
- Do not invent details.
- If a detail is unclear or missing, use null and add it to missing_fields.
- Do not put phone numbers, emails, social handles, or external contact instructions into public descriptions.
- Put detected contact details only in contact_details_found.
- Put a clearly visible public website address in website_url, normalized with https:// when possible.
- Prefer one of these categories: ${categories.join(', ')}.
- If pricing is unclear, use "unknown" and add pricing to missing_fields.
- Keep descriptions concise and suitable for a rural marketplace service card.
- When website copy is supplied, return exactly three distinct card_options grounded in that copy. Preserve a strong existing headline or tagline verbatim when useful. Do not invent claims.
- Keep each card headline under 55 characters and each supporting line under 125 characters.
`

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function signedInUser(req: Request) {
  const authorization = req.headers.get('authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization || !supabaseUrl || !anonKey) return null
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  })
  if (!response.ok) return null
  const user = await response.json()
  return typeof user?.id === 'string' ? user : null
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI response did not contain JSON.')
    return JSON.parse(match[0])
  }
}

function normalizeWebsiteUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

function normalizeDraft(raw: Record<string, unknown>) {
  const category = typeof raw.category === 'string' && categories.includes(raw.category)
    ? raw.category
    : raw.category
      ? 'Other'
      : null

  const cardOptions = Array.isArray(raw.card_options)
    ? raw.card_options.flatMap((option, index) => {
      if (!option || typeof option !== 'object') return []
      const value = option as Record<string, unknown>
      const headline = typeof value.headline === 'string' ? value.headline.trim().slice(0, 55) : ''
      const supportingText = typeof value.supporting_text === 'string' ? value.supporting_text.trim().slice(0, 125) : ''
      if (!headline) return []
      const allowedStyles = ['bold', 'bottom', 'clean']
      return [{
        label: typeof value.label === 'string' ? value.label.trim().slice(0, 30) : `Option ${index + 1}`,
        headline,
        supporting_text: supportingText,
        style: typeof value.style === 'string' && allowedStyles.includes(value.style) ? value.style : allowedStyles[index % 3],
      }]
    }).slice(0, 3)
    : []

  return {
    title: typeof raw.title === 'string' ? raw.title : null,
    category,
    short_description: typeof raw.short_description === 'string' ? raw.short_description : null,
    full_description: typeof raw.full_description === 'string' ? raw.full_description : null,
    service_area: typeof raw.service_area === 'string' ? raw.service_area : null,
    pricing_type: typeof raw.pricing_type === 'string' ? raw.pricing_type : 'unknown',
    price_amount: typeof raw.price_amount === 'number' ? raw.price_amount : null,
    pricing_notes: typeof raw.pricing_notes === 'string' ? raw.pricing_notes : null,
    availability: typeof raw.availability === 'string' ? raw.availability : null,
    equipment: Array.isArray(raw.equipment) ? raw.equipment.filter(item => typeof item === 'string') : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter(item => typeof item === 'string') : [],
    card_options: cardOptions,
    website_url: normalizeWebsiteUrl(raw.website_url),
    website_scanned: raw.website_scanned === true,
    contact_details_found: Array.isArray(raw.contact_details_found)
      ? raw.contact_details_found.filter(item => typeof item === 'string')
      : [],
    missing_fields: Array.isArray(raw.missing_fields) ? raw.missing_fields.filter(item => typeof item === 'string') : [],
    confidence_notes: Array.isArray(raw.confidence_notes)
      ? raw.confidence_notes.filter(item => typeof item === 'string')
      : [],
  }
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.')) return true
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const parts = ipv4.slice(1).map(Number)
  if (parts.some(part => part > 255)) return true
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
}

function publicWebsiteUrl(value: unknown) {
  const normalized = normalizeWebsiteUrl(value)
  if (!normalized) throw new Error('The detected website address is not valid.')
  const url = new URL(normalized)
  if (isBlockedHost(url.hostname) || (url.port && !['80', '443'].includes(url.port))) {
    throw new Error('That website address cannot be scanned.')
  }
  return url
}

async function readLimitedText(response: Response, limit = 350_000) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    text += decoder.decode(value.slice(0, Math.max(0, limit - (size - value.byteLength))), { stream: true })
  }
  reader.cancel().catch(() => {})
  return text + decoder.decode()
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function tagAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match ? decodeHtml(match[1].trim()) : ''
}

function readableWebsiteText(html: string) {
  const metadata: string[] = []
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (title) metadata.push(`Page title: ${decodeHtml(title.replace(/<[^>]+>/g, ' ').trim())}`)

  for (const tag of html.match(/<meta\s+[^>]*>/gi) || []) {
    const key = (tagAttribute(tag, 'name') || tagAttribute(tag, 'property')).toLowerCase()
    if (!['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'].includes(key)) continue
    const content = tagAttribute(tag, 'content')
    if (content) metadata.push(`${key}: ${content}`)
  }

  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      metadata.push(`Structured business data: ${JSON.stringify(JSON.parse(match[1]))}`)
    } catch {
      // Ignore malformed structured data and continue with visible metadata.
    }
  }

  const visible = decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

  return [...new Set([...metadata, visible].filter(Boolean))].join('\n').slice(0, 45_000)
}

function websiteImageCandidates(html: string, pageUrl: URL) {
  const candidates: string[] = []
  for (const tag of html.match(/<meta\s+[^>]*>/gi) || []) {
    const key = (tagAttribute(tag, 'property') || tagAttribute(tag, 'name')).toLowerCase()
    if (!['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(key)) continue
    const content = tagAttribute(tag, 'content')
    if (content) candidates.push(content)
  }
  for (const tag of html.match(/<(?:img|source)\s+[^>]*>/gi) || []) {
    const src = tagAttribute(tag, 'src') || tagAttribute(tag, 'srcset').split(/\s|,/)[0]
    if (src) candidates.push(src)
  }
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const structured = JSON.parse(match[1])
      const items = Array.isArray(structured) ? structured : [structured]
      for (const item of items) {
        const image = item?.image
        if (typeof image === 'string') candidates.push(image)
        else if (typeof image?.url === 'string') candidates.push(image.url)
      }
    } catch {
      // Malformed structured data is already ignored by the text extractor.
    }
  }
  return candidates.flatMap(candidate => {
    try {
      const imageUrl = publicWebsiteUrl(new URL(candidate, pageUrl).toString())
      // Images explicitly declared by the scanned page may be hosted by its
      // publishing CDN (for example Squarespace or Cloudinary).
      return [imageUrl.toString()]
    } catch {
      return []
    }
  })
}

async function validWebsiteImage(value: string, _pageUrl: URL) {
  let imageUrl = publicWebsiteUrl(value)
  for (let redirect = 0; redirect < 3; redirect++) {
    const response = await fetch(imageUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'RuralConnectionsServiceDraftBot/1.0',
        Accept: 'image/webp,image/png,image/jpeg',
        Range: 'bytes=0-1023',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      response.body?.cancel().catch(() => {})
      if (!location) return null
      imageUrl = publicWebsiteUrl(new URL(location, imageUrl).toString())
      continue
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    const contentLength = Number(response.headers.get('content-length') || 0)
    response.body?.cancel().catch(() => {})
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp']
    return response.ok && supportedTypes.includes(contentType.split(';')[0]) && (!contentLength || contentLength <= 5 * 1024 * 1024)
      ? imageUrl.toString()
      : null
  }
  return null
}

function marketingCopyFromScript(script: string) {
  const copy: string[] = []
  for (const match of script.matchAll(/["']([A-Z][A-Z0-9 .,&'!?…-]{7,90})["']/g)) {
    const value = match[1].replace(/\s+/g, ' ').trim()
    if (value.split(/\s+/).length >= 2) copy.push(value)
  }
  for (const match of script.matchAll(/children\s*:\s*["']((?:\\.|[^"'\\]){8,300})["']/g)) {
    const value = match[1]
      .replace(/\\n/g, ' ')
      .replace(/\\["']/g, quote => quote.slice(1))
      .replace(/\s+/g, ' ')
      .trim()
    if (value.split(/\s+/).length < 2 || /(?:className|https?:\/\/|\{\}|=>)/.test(value)) continue
    copy.push(value)
  }
  return [...new Set(copy)].slice(0, 80)
}

async function websiteEnhancementsFromHtml(html: string, pageUrl: URL) {
  const directCandidates = websiteImageCandidates(html, pageUrl)
  let imageUrl: string | null = null
  for (const candidate of [...new Set(directCandidates)]) {
    const valid = await validWebsiteImage(candidate, pageUrl).catch(() => null)
    if (valid) {
      imageUrl = valid
      break
    }
  }

  // JavaScript-rendered sites often keep their hero image in the main module
  // rather than the initial HTML. Inspect same-site modules only, and favour
  // filenames that describe a listing-friendly image over logos and portraits.
  const marketingCopy: string[] = []
  for (const tag of (html.match(/<script\s+[^>]*src=["'][^"']+["'][^>]*>/gi) || []).slice(0, 2)) {
    const src = tagAttribute(tag, 'src')
    if (!src) continue
    let scriptUrl: URL
    try {
      scriptUrl = publicWebsiteUrl(new URL(src, pageUrl).toString())
      if (scriptUrl.hostname !== pageUrl.hostname) continue
    } catch {
      continue
    }
    try {
      const response = await fetch(scriptUrl, {
        headers: { 'User-Agent': 'RuralConnectionsServiceDraftBot/1.0', Accept: 'text/javascript,application/javascript' },
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) continue
      const script = await readLimitedText(response, 500_000)
      marketingCopy.push(...marketingCopyFromScript(script))
      if (imageUrl) continue
      const assets = [...script.matchAll(/["']([^"']+\.(?:jpe?g|png|webp))["']/gi)]
        .map(match => match[1])
        .filter(path => !/(logo|icon|avatar|portrait)/i.test(path))
        .sort((a, b) => Number(/(hero|banner|cover|service)/i.test(b)) - Number(/(hero|banner|cover|service)/i.test(a)))
      for (const asset of [...new Set(assets)].slice(0, 10)) {
        const candidate = new URL(asset, scriptUrl).toString()
        const valid = await validWebsiteImage(candidate, pageUrl).catch(() => null)
        if (valid) {
          imageUrl = valid
          break
        }
      }
    } catch {
      // A missing bundle image should not prevent the service draft itself.
    }
  }
  return { imageUrl, marketingText: [...new Set(marketingCopy)].join('\n').slice(0, 12_000) }
}

async function readPublicWebsite(value: unknown) {
  let url = publicWebsiteUrl(value)
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'RuralConnectionsServiceDraftBot/1.0', Accept: 'text/html,text/plain' },
      signal: AbortSignal.timeout(10_000),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('The website redirect was incomplete.')
      url = publicWebsiteUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) throw new Error(`The website returned ${response.status}.`)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error('The website did not return a readable page.')
    }
    const html = await readLimitedText(response)
    const text = readableWebsiteText(html)
    if (text.length < 80) throw new Error('The website did not contain enough readable service information.')
    const enhancements = await websiteEnhancementsFromHtml(html, url)
    return {
      url: url.toString(),
      text: [text, enhancements.marketingText && `Marketing copy rendered by the website:\n${enhancements.marketingText}`]
        .filter(Boolean)
        .join('\n'),
      imageUrl: enhancements.imageUrl,
    }
  }
  throw new Error('The website redirected too many times.')
}

async function callOpenAi(openAiApiKey: string, content: Record<string, unknown>[]) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini', input: [{ role: 'user', content }] }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error?.message || 'OpenAI request failed.')
  const outputText = extractOutputText(result)
  if (!outputText) throw new Error('AI response did not include text output.')
  return normalizeDraft(safeParseJson(outputText))
}

function extractOutputText(result: Record<string, unknown>) {
  if (typeof result.output_text === 'string') return result.output_text
  if (!Array.isArray(result.output)) return null

  for (const item of result.output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const candidate = part as { type?: unknown; text?: unknown }
      if (candidate.type === 'output_text' && typeof candidate.text === 'string') return candidate.text
    }
  }

  return null
}

async function downloadPublicWebsiteImage(value: unknown) {
  let imageUrl = publicWebsiteUrl(value)
  for (let redirect = 0; redirect < 3; redirect++) {
    const response = await fetch(imageUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'RuralConnectionsServiceImageBot/1.0',
        Accept: 'image/webp,image/png,image/jpeg',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      response.body?.cancel().catch(() => {})
      if (!location) throw new Error('The website image redirect was incomplete.')
      imageUrl = publicWebsiteUrl(new URL(location, imageUrl).toString())
      continue
    }
    if (!response.ok) throw new Error(`The website image returned ${response.status}.`)
    const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      response.body?.cancel().catch(() => {})
      throw new Error('The website image format is not supported.')
    }
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (declaredSize > 5 * 1024 * 1024) {
      response.body?.cancel().catch(() => {})
      throw new Error('The website image is larger than 5 MB.')
    }
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('The website image is larger than 5 MB.')
    return { bytes, contentType }
  }
  throw new Error('The website image redirected too many times.')
}

async function copyWebsiteImageToService(serviceId: unknown, imageValue: unknown, userId: string) {
  if (typeof serviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
    throw new Error('A valid service is required before copying the image.')
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Service image storage is not configured.')

  const ownershipResponse = await fetch(
    `${supabaseUrl}/rest/v1/services?id=eq.${encodeURIComponent(serviceId)}&provider_id=eq.${encodeURIComponent(userId)}&select=id`,
    { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } }
  )
  const ownedServices = ownershipResponse.ok ? await ownershipResponse.json() : []
  if (!Array.isArray(ownedServices) || ownedServices.length !== 1) {
    throw new Error('You can only add an image to your own service.')
  }

  const image = await downloadPublicWebsiteImage(imageValue)
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const extension = extensions[image.contentType] || 'jpg'
  const fileName = `website_${crypto.randomUUID()}.${extension}`
  const objectPath = `${serviceId}/${fileName}`
  const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/service-photos/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': image.contentType,
      'x-upsert': 'false',
    },
    body: image.bytes,
  })
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text()
    throw new Error(`Could not store the website image${detail ? `: ${detail.slice(0, 160)}` : '.'}`)
  }
  return `${supabaseUrl}/storage/v1/object/public/service-photos/${objectPath}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  const user = await signedInUser(req)
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

  try {
    const {
      image_base64,
      mime_type,
      image_size_bytes,
      website_url,
      allow_website_scan,
      current_draft,
      copy_website_image,
      service_id,
      website_image_url,
    } = await req.json()

    if (copy_website_image === true) {
      const photoUrl = await copyWebsiteImageToService(service_id, website_image_url, user.id)
      return jsonResponse({ photo_url: photoUrl })
    }

    const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiApiKey) {
      return jsonResponse({ error: 'OPENAI_API_KEY is not configured for this Supabase function.' }, 500)
    }

    if (allow_website_scan === true) {
      if (!website_url) return jsonResponse({ error: 'website_url is required.' }, 400)
      const website = await readPublicWebsite(website_url)
      const enrichmentPrompt = `${systemPrompt}

You are now improving an existing photo-created draft using text from a public website that the user explicitly approved scanning.
- Preserve useful facts already present in the draft unless the website clearly provides a correction or more detail.
- Use only service information supported by the supplied draft or website text.
- Never copy testimonials, unverifiable superlatives, phone numbers, email addresses, or instructions to contact the provider outside Rural Connections into descriptions.
- Set website_url to the supplied public URL and website_scanned to true.
- Create three genuinely useful card_options: one preserving the strongest website headline, one concise practical summary, and one warm problem/solution treatment.
- Reuse the website's exact tagline when it is strong and supported by the supplied copy.

Existing draft:
${JSON.stringify(current_draft && typeof current_draft === 'object' ? current_draft : {})}

Approved website URL: ${website.url}
Readable website text:
${website.text}`
      const draft = await callOpenAi(openAiApiKey, [{ type: 'input_text', text: enrichmentPrompt }])
      return jsonResponse({
        draft: {
          ...draft,
          website_url: website.url,
          website_scanned: true,
          website_image_url: website.imageUrl,
        },
      })
    }

    if (!image_base64 || typeof image_base64 !== 'string') {
      return jsonResponse({ error: 'image_base64 is required.' }, 400)
    }
    const approxBytes = typeof image_size_bytes === 'number'
      ? image_size_bytes
      : Math.round((image_base64.length * 3) / 4)
    console.log(`create-service-draft-from-photo: received image approx ${approxBytes} bytes`)

    const imageUrl = `data:${mime_type || 'image/jpeg'};base64,${image_base64}`
    console.log('create-service-draft-from-photo: calling OpenAI Responses API')
    const draft = await callOpenAi(openAiApiKey, [
      { type: 'input_text', text: systemPrompt },
      { type: 'input_image', image_url: imageUrl, detail: 'high' },
    ])
    console.log('create-service-draft-from-photo: draft created')
    return jsonResponse({ draft })
  } catch (error) {
    console.error('create-service-draft-from-photo: failed', error instanceof Error ? error.message : error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not create draft.' }, 500)
  }
})
