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

// Type-of-work colour coding for the network view. A fixed rural palette,
// assigned to each category by a stable hash so any category (job or service,
// including ones added later) gets a consistent colour.
export const CATEGORY_PALETTE = [
  '#2d6a4f', // forest
  '#bc6c25', // ochre
  '#386fa4', // steel blue
  '#9c6644', // earth brown
  '#6a994e', // leaf
  '#a44a3f', // clay red
  '#8367c7', // lavender
  '#c9a227', // mustard
]

export function categoryColor(cat) {
  if (!cat) return '#8a8f98'
  const s = String(cat).toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length]
}

// The category that colours a connection's node (first/most prominent).
export function primaryCategory(categories) {
  return (categories || []).filter(Boolean)[0] || null
}

// Up to `max` category labels joined for a compact subtitle.
export function categoriesLabel(categories, max = 3) {
  const list = (categories || []).filter(Boolean)
  if (list.length === 0) return ''
  if (list.length <= max) return list.join(' · ')
  return `${list.slice(0, max).join(' · ')} +${list.length - max}`
}
