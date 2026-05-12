import { supabase } from './supabase'

export async function loadUserPreferences() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return null

    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    return data
  } catch {
    return null
  }
}

export async function updateUserPreferences(prefs) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    await supabase.from('user_preferences').upsert(
      { user_id: session.user.id, ...prefs },
      { onConflict: 'user_id' }
    )
  } catch {
    // Preferences update must never break the app
  }
}

export async function trackCategoryInterest(category) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const { data: existing } = await supabase
      .from('user_preferences')
      .select('preferred_categories')
      .eq('user_id', session.user.id)
      .single()

    const current = existing?.preferred_categories ?? []
    if (current.includes(category)) return

    await supabase.from('user_preferences').upsert(
      { user_id: session.user.id, preferred_categories: [...current, category] },
      { onConflict: 'user_id' }
    )
  } catch {
    // Category tracking must never break the app
  }
}

export async function updateLastSeen() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    await supabase.from('user_preferences').upsert(
      { user_id: session.user.id, last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  } catch {
    // Last seen update must never break the app
  }
}
