import { supabase } from './supabase'

export async function fetchSeasonalReminders() {
  try {
    const { data, error } = await supabase.rpc('get_my_seasonal_campaigns')
    if (error) throw error
    return data || []
  } catch {
    // Seasonal content is supplementary and must never block Home.
    return []
  }
}

export async function recordSeasonalEvent(campaignId, event) {
  try {
    await supabase.rpc('record_seasonal_campaign_event', {
      p_campaign_id: campaignId,
      p_event: event,
    })
  } catch {
    // Engagement tracking should not interrupt the user's action.
  }
}

