import { supabase } from './supabase'

export async function loadReview({ jobId, bookingId, reviewerId, reviewerRole }) {
  let query = supabase
    .from('reviews')
    .select('*')
    .eq('reviewer_id', reviewerId)
    .eq('reviewer_role', reviewerRole)

  query = bookingId ? query.eq('booking_id', bookingId) : query.eq('job_id', jobId)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data || null
}

export async function saveReview({
  jobId,
  bookingId,
  reviewerId,
  revieweeId,
  reviewerRole,
  revieweeRole,
  rating,
  comment,
}) {
  const existing = await loadReview({ jobId, bookingId, reviewerId, reviewerRole })
  const payload = {
    job_id: jobId || null,
    reviewer_id: reviewerId,
    reviewee_id: revieweeId,
    reviewer_role: reviewerRole,
    reviewee_role: revieweeRole,
    rating,
    comment: comment?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  if (bookingId) payload.booking_id = bookingId

  if (existing?.id) {
    const { data, error } = await supabase
      .from('reviews')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}
