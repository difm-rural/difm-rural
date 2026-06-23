import { supabase } from './supabase'

// Infers a job category from its title + description via the categorize-job
// edge function. Always resolves to a category string ('Other' on any failure)
// so posting a job is never blocked by categorisation.
export async function inferJobCategory(title, description) {
  try {
    const { data, error } = await supabase.functions.invoke('categorize-job', {
      body: { title, description },
    })
    if (error) return 'Other'
    return data?.category || 'Other'
  } catch {
    return 'Other'
  }
}
