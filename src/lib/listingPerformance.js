import { supabase } from './supabase'

export async function recordJobProviderView(jobId) {
  if (!jobId) return false
  try {
    const { data, error } = await supabase.rpc('record_job_provider_view', {
      p_job_id: jobId,
    })
    return !error && data === true
  } catch {
    return false
  }
}

export async function fetchJobListingPerformance(jobId) {
  if (!jobId) return null
  const { data, error } = await supabase.rpc('get_job_listing_performance', {
    p_job_id: jobId,
  })
  if (error) {
    console.log('Could not load listing performance:', error)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    providerViews: Number(row.provider_views) || 0,
    matchingProviders: Number(row.matching_providers) || 0,
    previousProviders: Number(row.previous_providers) || 0,
  }
}

export function listingFeedback(job, performance) {
  if (!job || !performance) return []

  const photos = Array.isArray(job.photos) ? job.photos.filter(Boolean) : []
  const words = String(job.description || '').trim().split(/\s+/).filter(Boolean).length
  const items = []

  if (photos.length === 0) {
    items.push({
      key: 'photo',
      icon: 'image-outline',
      title: 'Add a photo',
      detail: 'This listing has no photos. Show the work area or the result you need.',
      action: 'edit',
    })
  }

  if (job.price_type === 'open') {
    items.push({
      key: 'budget',
      icon: 'cash-outline',
      title: 'Add an indicative budget',
      detail: 'The budget is currently open to offers. A guide can help providers assess the job.',
      action: 'edit',
    })
  }

  if (words < 25) {
    items.push({
      key: 'description',
      icon: 'document-text-outline',
      title: 'Add more job detail',
      detail: `The description is ${words} word${words === 1 ? '' : 's'} long. Include size, access and the result you need.`,
      action: 'edit',
    })
  }

  if (performance.previousProviders > 0) {
    items.push({
      key: 'connections',
      icon: 'people-outline',
      title: 'Invite a previous provider',
      detail: `You have ${performance.previousProviders} provider${performance.previousProviders === 1 ? '' : 's'} you have worked with before.`,
      action: 'connections',
    })
  }

  return items
}
