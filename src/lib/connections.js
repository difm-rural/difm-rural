// Connections — people a user has completed work with.
// Backed by the `connections` DB view (completed jobs + bookings, grouped by
// the requester/provider pair). Names/avatars come from `profiles_public`.
import { supabase } from './supabase'

// Providers the given requester has worked with, most recent first, each with
// a `.provider` { id, full_name, avatar_url } attached.
export async function fetchConnectionsForRequester(uid) {
  if (!uid) return []
  const { data: rows, error } = await supabase
    .from('connections')
    .select('*')
    .eq('requester_id', uid)
    .order('last_engaged_at', { ascending: false })
  if (error || !rows?.length) return []

  const providerIds = [...new Set(rows.map(r => r.provider_id).filter(Boolean))]
  const { data: profiles } = await supabase
    .from('profiles_public')
    .select('id, full_name, avatar_url')
    .in('id', providerIds)
  const pmap = {}
  profiles?.forEach(p => { pmap[p.id] = p })

  return rows.map(r => ({ ...r, provider: pmap[r.provider_id] || null }))
}

// "Apr 2026" — engagement month/year (we only store created_at, not a
// completion timestamp, so this is the engagement date).
export function formatLastWorked(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

// "Worked together 3 times" / "Worked together once".
export function timesWorkedLabel(times) {
  const n = times || 0
  if (n <= 1) return 'Worked together once'
  return `Worked together ${n} times`
}

// Up to `max` category labels joined for a compact subtitle.
export function categoriesLabel(categories, max = 3) {
  const list = (categories || []).filter(Boolean)
  if (list.length === 0) return ''
  if (list.length <= max) return list.join(' · ')
  return `${list.slice(0, max).join(' · ')} +${list.length - max}`
}
