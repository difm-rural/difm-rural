import { supabase } from './supabase'

export async function trackEvent(eventType, metadata = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    await supabase.from('user_activity').insert({
      user_id: session.user.id,
      event_type: eventType,
      metadata,
    })
  } catch {
    // Tracking must never break the app
  }
}
