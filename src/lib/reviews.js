import { supabase } from './supabase'

export async function loadReview({ jobId, reviewerId, reviewerRole }) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('job_id', jobId)
    .eq('reviewer_id', reviewerId)
    .eq('reviewer_role', reviewerRole)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function saveReview({
  jobId,
  reviewerId,
  revieweeId,
  reviewerRole,
  revieweeRole,
  rating,
  comment,
}) {
  const { data, error } = await supabase
    .from('reviews')
    .upsert(
      {
        job_id: jobId,
        reviewer_id: reviewerId,
        reviewee_id: revieweeId,
        reviewer_role: reviewerRole,
        reviewee_role: revieweeRole,
        rating,
        comment: comment?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'job_id,reviewer_id,reviewer_role' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}
