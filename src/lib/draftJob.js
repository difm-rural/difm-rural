// AI job assistant — turn a natural spoken/typed description into a job draft.
import { supabase } from './supabase'

export async function draftJobFromText(text) {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase.functions.invoke('draft-job-from-text', {
    body: { text, today },
  })
  if (error) throw new Error(error.message || 'Could not reach the assistant. Please try again.')
  if (data?.error) throw new Error(data.error)
  return data?.draft || null
}

// Map an AI draft onto PostJobContext fields. Budget range / duration / skills
// are advisory (no dedicated job columns) — the AI also weaves the gist into the
// description, so nothing is lost. We fill title/description/category/budget/when.
export function draftToJobData(draft) {
  const priceType = draft.price_type === 'fixed' ? 'fixed' : 'open'

  let price = ''
  if (priceType === 'fixed' && draft.budget_low) {
    const hi = draft.budget_high || draft.budget_low
    price = String(Math.round((Number(draft.budget_low) + Number(hi)) / 2))
  }

  let scheduledDate = null
  if (draft.schedule_type === 'specific' && draft.scheduled_date) {
    const d = new Date(draft.scheduled_date)
    if (!isNaN(d.getTime())) scheduledDate = d.toISOString()
  }

  return {
    title:        draft.title || '',
    description:  draft.description || '',
    category:     draft.category || '',
    priceType,
    price,
    scheduleType: draft.schedule_type || 'flexible',
    scheduledDate,
  }
}

// Human-readable budget line for the draft preview.
export function draftBudgetText(draft) {
  if (draft.budget_low && draft.budget_high && draft.budget_high !== draft.budget_low) {
    return `$${draft.budget_low}–$${draft.budget_high} NZD${draft.price_type === 'open' ? ' · open to offers' : ''}`
  }
  if (draft.budget_low) return `Around $${draft.budget_low} NZD`
  return 'Open to offers'
}
