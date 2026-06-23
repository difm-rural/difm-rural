// Infers a job category from its title + description.
// Returns { category } — always one of the known categories, defaulting to
// "Other" on any error so job posting is never blocked.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Keep in sync with src/lib/categories.js JOB_CATEGORIES.
const CATEGORIES = [
  'Fencing', 'Maintenance', 'Property Check', 'Landscaping',
  'Animal Care', 'Machinery', 'Labour', 'Spraying',
  'Water', 'General Labour', 'Other',
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function extractOutputText(result: any): string | null {
  if (typeof result?.output_text === 'string') return result.output_text
  const parts = result?.output?.flatMap?.((o: any) => o?.content || []) || []
  const text = parts.map((p: any) => p?.text || '').join('').trim()
  return text || null
}

function pickCategory(raw: string | null): string {
  if (!raw) return 'Other'
  const cleaned = raw.trim()
  const match = CATEGORIES.find(c => c.toLowerCase() === cleaned.toLowerCase())
  return match || 'Other'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiApiKey) return jsonResponse({ category: 'Other' })

  try {
    const { title, description } = await req.json()
    const combined = [title, description].filter(Boolean).join('\n').trim()
    if (!combined) return jsonResponse({ category: 'Other' })

    const prompt = `You categorise rural job listings for a New Zealand marketplace.
Choose the single best category from this exact list:
${CATEGORIES.join(', ')}
Reply with ONLY the category name, exactly as written above. If unsure, reply "Other".

Job title: ${title || '(none)'}
Job details: ${description || '(none)'}`

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini',
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      console.error('categorize-job: OpenAI error', result?.error?.message || response.status)
      return jsonResponse({ category: 'Other' })
    }

    return jsonResponse({ category: pickCategory(extractOutputText(result)) })
  } catch (error) {
    console.error('categorize-job: failed', error instanceof Error ? error.message : error)
    return jsonResponse({ category: 'Other' })
  }
})
