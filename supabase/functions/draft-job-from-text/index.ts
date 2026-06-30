const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const categories = [
  'Fencing', 'Maintenance', 'Property Check', 'Landscaping',
  'Animal Care', 'Machinery', 'Labour', 'Spraying',
  'Water', 'General Labour', 'Other',
]

const systemPrompt = `
You turn a spoken/typed description from a rural New Zealander into a job posting
for DIFM Rural (a marketplace where locals post jobs and nearby providers offer
to do them). The user is often outdoors and speaking, so the input may be casual.

Return JSON only, with this exact shape:
{
  "title": string,              // short, plain, <= 60 chars (e.g. "Shift ~50 cows to back paddock")
  "description": string,        // 2-4 sentences, first person, natural. Include the key details the
                                //   provider needs (numbers, timing, what's involved). If a duration or
                                //   particular skill matters, mention it here too.
  "category": string,           // EXACTLY one of: ${categories.join(', ')}
  "budget_low": number | null,  // realistic NZD estimate, or null if you truly can't tell
  "budget_high": number | null, // NZD
  "price_type": "fixed" | "open",  // "open" (open to offers) unless the work is very standard/fixed
  "duration": string | null,    // plain estimate e.g. "About 2 hours", or null
  "skills": string[],           // helpful skills/experience e.g. ["Stock handling","Working dog"]
  "schedule_type": "asap" | "specific" | "flexible",
  "scheduled_date": string | null  // "YYYY-MM-DD" only when a specific day is implied, else null
}

Rules:
- New Zealand rural context. Prices in NZD. Be realistic, not generous.
- Pick the single best category from the list. If nothing fits, use "Other".
- Do NOT invent specifics that weren't implied (exact addresses, names, prices stated as facts).
- Interpret relative dates against "today" given in the request (e.g. "tomorrow morning" ->
  tomorrow's date, schedule_type "specific"). "as soon as possible" -> "asap". Vague timing -> "flexible".
- Keep it concise and friendly. No phone numbers, emails, or contact instructions in the description.
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

function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? Math.round(v) : null
}

function normalizeDraft(raw: Record<string, unknown>) {
  const category = typeof raw.category === 'string' && categories.includes(raw.category)
    ? raw.category
    : 'Other'
  const priceType = raw.price_type === 'fixed' ? 'fixed' : 'open'
  const scheduleType = ['asap', 'specific', 'flexible'].includes(raw.schedule_type as string)
    ? (raw.schedule_type as string)
    : 'flexible'
  const scheduledDate = typeof raw.scheduled_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.scheduled_date)
    ? raw.scheduled_date
    : null

  return {
    title: typeof raw.title === 'string' ? raw.title.slice(0, 80) : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    category,
    budget_low: num(raw.budget_low),
    budget_high: num(raw.budget_high),
    price_type: priceType,
    duration: typeof raw.duration === 'string' ? raw.duration : null,
    skills: Array.isArray(raw.skills) ? raw.skills.filter(s => typeof s === 'string').slice(0, 6) : [],
    schedule_type: scheduleType,
    scheduled_date: scheduleType === 'specific' ? scheduledDate : null,
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
    const { text, today } = await req.json()
    if (!text || typeof text !== 'string' || text.trim().length < 4) {
      return jsonResponse({ error: 'Please describe the job in a few words.' }, 400)
    }
    const todayStr = typeof today === 'string' ? today : new Date().toISOString().slice(0, 10)

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
              { type: 'input_text', text: `${systemPrompt}\n\nToday is ${todayStr}.\n\nUser request:\n${text.trim()}` },
            ],
          },
        ],
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      console.error('draft-job-from-text: OpenAI error', result?.error?.message || response.status)
      return jsonResponse({ error: result?.error?.message || 'OpenAI request failed.' }, response.status)
    }

    const outputText = extractOutputText(result)
    if (!outputText) return jsonResponse({ error: 'AI response did not include text output.' }, 502)

    const draft = normalizeDraft(safeParseJson(outputText))
    return jsonResponse({ draft })
  } catch (error) {
    console.error('draft-job-from-text: failed', error instanceof Error ? error.message : error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not create a draft.' }, 500)
  }
})
