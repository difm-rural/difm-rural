// Connections — people a user has completed work with.
// Backed by the `connections` DB view (completed jobs + bookings, grouped by
// the requester/provider pair). Names/avatars come from `profiles_public`.
import { supabase } from './supabase'
import { allRows, relationshipColumn } from '../../shared/relationshipHistory'

// Providers the given requester has worked with, most recent first, each with
// a `.provider` { id, full_name, avatar_url } attached.
export async function fetchConnections(uid, side) {
  if (!uid) return []
  const column = relationshipColumn(side)
  const otherColumn = side === 'customers' ? 'requester_id' : 'provider_id'
  const rows = await allRows(() => supabase
    .from('connections')
    .select('requester_id,provider_id,times_worked,jobs_count,bookings_count,first_engaged_at,last_engaged_at,categories')
    .eq(column, uid)
    .order('last_engaged_at', { ascending: false }).order(otherColumn))
  const people = new Map()
  const ids = rows.map(row => row[otherColumn]).filter(id => id && id !== uid)

  for(let i=0;i<ids.length;i+=200){
    const {data,error}=await supabase.from('profiles_public').select('id,full_name,avatar_url,region').in('id',ids.slice(i,i+200))
    if(error)throw error
    data?.forEach(person=>people.set(person.id,person))
  }
  return rows.filter(row=>row[column]===uid&&row[otherColumn]&&row[otherColumn]!==uid)
    .map(row=>({...row,personId:row[otherColumn],person:people.get(row[otherColumn])??null}))
}

// "Apr 2026" — engagement month/year (we only store created_at, not a
// completion timestamp, so this is the engagement date).
export function formatLastWorked(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric', timeZone:'Pacific/Auckland' })
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
