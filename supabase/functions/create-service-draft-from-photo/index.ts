const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const categories = [
  'Machinery',
  'Labour',
  'Water delivery',
  'Animal care',
  'Maintenance',
  'Fencing',
  'Other',
]

const systemPrompt = `
You extract rural service listing details from photos for DIFM Rural.

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
  "contact_details_found": string[],
  "missing_fields": string[],
  "confidence_notes": string[]
}

Rules:
- Do not invent details.
- If a detail is unclear or missing, use null and add it to missing_fields.
- Do not put phone numbers, emails, social handles, or external contact instructions into public descriptions.
- Put detected contact details only in contact_details_found.
- Prefer one of these categories: ${categories.join(', ')}.
- If pricing is unclear, use "unknown" and add pricing to missing_fields.
- Keep descriptions concise and suitable for a rural marketplace service card.
`

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

function normalizeDraft(raw: Record<string, unknown>) {
  const category = typeof raw.category === 'string' && categories.includes(raw.category)
    ? raw.category
    : raw.category
      ? 'Other'
      : null

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
    contact_details_found: Array.isArray(raw.contact_details_found)
      ? raw.contact_details_found.filter(item => typeof item === 'string')
      : [],
    missing_fields: Array.isArray(raw.missing_fields) ? raw.missing_fields.filter(item => typeof item === 'string') : [],
    confidence_notes: Array.isArray(raw.confidence_notes)
      ? raw.confidence_notes.filter(item => typeof item === 'string')
      : [],
  }
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiApiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY is not configured for this Supabase function.' }, 500)
  }

  try {
    const { image_base64, mime_type, image_size_bytes } = await req.json()
    if (!image_base64 || typeof image_base64 !== 'string') {
      return jsonResponse({ error: 'image_base64 is required.' }, 400)
    }
    const approxBytes = typeof image_size_bytes === 'number'
      ? image_size_bytes
      : Math.round((image_base64.length * 3) / 4)
    console.log(`create-service-draft-from-photo: received image approx ${approxBytes} bytes`)

    const imageUrl = `data:${mime_type || 'image/jpeg'};base64,${image_base64}`
    console.log('create-service-draft-from-photo: calling OpenAI Responses API')
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: systemPrompt },
              { type: 'input_image', image_url: imageUrl, detail: 'high' },
            ],
          },
        ],
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      console.error('create-service-draft-from-photo: OpenAI error', result?.error?.message || response.status)
      return jsonResponse({ error: result?.error?.message || 'OpenAI request failed.' }, response.status)
    }

    const outputText = extractOutputText(result)
    if (!outputText) {
      return jsonResponse({ error: 'AI response did not include text output.' }, 502)
    }

    const draft = normalizeDraft(safeParseJson(outputText))
    console.log('create-service-draft-from-photo: draft created')
    return jsonResponse({ draft })
  } catch (error) {
    console.error('create-service-draft-from-photo: failed', error instanceof Error ? error.message : error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not create draft.' }, 500)
  }
})
