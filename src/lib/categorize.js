import { supabase } from './supabase'
import { CATEGORIES } from './categories'

// Infers a job category from its title + description via the categorize-job
// edge function. Returns a category and whether it came from a suggestion so posting a job is never blocked by categorisation.
const FALLBACK_CATEGORY = 'General Rural Help'

export async function inferJobCategory(title, description) {
  try {
    const { data, error } = await supabase.functions.invoke('categorize-job', {
      body: { title, description },
      timeout: 8000,
    })
    if (!error && CATEGORIES.includes(data?.category)) return { category: data.category, suggested: true }
  } catch { /* Keep the form usable when categorisation fails. */ }
  return { category: FALLBACK_CATEGORY, suggested: false }
}
