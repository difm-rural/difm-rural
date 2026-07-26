import { supabase } from './supabase'

export const SAVED_INTEREST_FREQUENCIES = [
  { value: 'instant', label: 'Instant', description: 'Tell me when a matching job is posted.' },
  { value: 'daily', label: 'Daily summary', description: 'Bundle new matches into one update each day.' },
  { value: 'off', label: 'Saved only', description: 'Keep the search without sending alerts.' },
]

export async function fetchSavedInterests(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('saved_interests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveJobSearch(userId, values) {
  const filterKey = JSON.stringify({
    kind: 'saved_search',
    query: values.query?.trim().toLowerCase() || '',
    category: values.category || '',
    latitude: values.latitude == null ? null : Number(values.latitude).toFixed(4),
    longitude: values.longitude == null ? null : Number(values.longitude).toFixed(4),
    radius_km: values.radiusKm || null,
  })
  const row = {
    user_id: userId,
    kind: 'saved_search',
    name: values.name.trim(),
    filter_key: filterKey,
    query: values.query?.trim() || null,
    category: values.category || null,
    location_name: values.locationName || null,
    latitude: values.latitude ?? null,
    longitude: values.longitude ?? null,
    radius_km: values.radiusKm ?? null,
    frequency: values.frequency,
    push_enabled: values.frequency !== 'off' && values.pushEnabled,
    email_enabled: values.frequency !== 'off' && values.emailEnabled,
    active: true,
    auto_paused_at: null,
    last_engaged_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('saved_interests')
    .upsert(row, { onConflict: 'user_id,filter_key' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSavedInterest(id, values) {
  const { data, error } = await supabase
    .from('saved_interests')
    .update({ ...values, last_engaged_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSavedInterest(id) {
  const { error } = await supabase.from('saved_interests').delete().eq('id', id)
  if (error) throw error
}
