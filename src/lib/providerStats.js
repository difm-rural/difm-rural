import { supabase } from './supabase'

// Returns a map: providerId -> { ratingAvg, ratingCount, jobsDone }.
// Reviews are publicly readable, so this works for any provider. Ratings and
// the jobs-done count are fetched independently so one failing query doesn't
// wipe out the other.
export async function fetchProviderStats(providerIds = []) {
  const ids = [...new Set((providerIds || []).filter(Boolean))]
  const map = {}
  ids.forEach(id => { map[id] = { ratingAvg: 0, ratingCount: 0, jobsDone: 0 } })
  if (ids.length === 0) return map

  // Ratings (as a provider)
  try {
    const { data } = await supabase
      .from('reviews')
      .select('reviewee_id, rating')
      .in('reviewee_id', ids)
      .eq('reviewee_role', 'provider')
    const totals = {}
    ;(data || []).forEach(r => {
      const m = map[r.reviewee_id]
      if (!m) return
      m.ratingCount += 1
      totals[r.reviewee_id] = (totals[r.reviewee_id] || 0) + (r.rating || 0)
    })
    ids.forEach(id => {
      const m = map[id]
      m.ratingAvg = m.ratingCount > 0 ? totals[id] / m.ratingCount : 0
    })
  } catch { /* leave ratings at zero */ }

  // Jobs done = completed jobs (won via accepted bid) + completed service bookings
  try {
    const [bidsRes, bookingsRes] = await Promise.all([
      supabase.from('bids').select('provider_id, jobs!inner(status)').in('provider_id', ids).eq('status', 'accepted'),
      supabase.from('bookings').select('provider_id').in('provider_id', ids).eq('status', 'completed'),
    ])
    ;(bidsRes.data || []).forEach(b => {
      if (b.jobs?.status === 'completed' && map[b.provider_id]) map[b.provider_id].jobsDone += 1
    })
    ;(bookingsRes.data || []).forEach(b => {
      if (map[b.provider_id]) map[b.provider_id].jobsDone += 1
    })
  } catch { /* leave jobsDone at zero */ }

  return map
}

// "★ 4.8 (12)" or "New provider"
export function formatProviderRating(stats) {
  if (!stats || stats.ratingCount === 0) return 'New provider'
  return `★ ${stats.ratingAvg.toFixed(1)} (${stats.ratingCount})`
}
