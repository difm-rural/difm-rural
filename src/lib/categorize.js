import { supabase } from './supabase'

// Infers a job category from its title + description via the categorize-job
// edge function. Always resolves to a category string ('General Rural Help' on
// any failure) so posting a job is never blocked by categorisation.
const FALLBACK_CATEGORY = 'General Rural Help'

export async function inferJobCategory(title, description) {
  try {
    const { data, error } = await supabase.functions.invoke('categorize-job', {
      body: { title, description },
    })
    if (error) return FALLBACK_CATEGORY
    return data?.category || FALLBACK_CATEGORY
  } catch {
    return FALLBACK_CATEGORY
  }
}
