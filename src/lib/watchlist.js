import { supabase } from './supabase'

export async function fetchWatchlistIds(userId) {
  const { data } = await supabase.from('watchlist').select('job_id').eq('user_id', userId)
  return new Set((data || []).map(r => r.job_id))
}

export async function addToWatchlist(userId, jobId) {
  const { error } = await supabase.from('watchlist').insert({ user_id: userId, job_id: jobId })
  return !error
}

export async function removeFromWatchlist(userId, jobId) {
  const { error } = await supabase.from('watchlist').delete().eq('user_id', userId).eq('job_id', jobId)
  return !error
}
