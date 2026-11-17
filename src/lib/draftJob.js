import {formatMoney as nzMoney} from '../../shared/formatting.js'
import {nzCalendarDay,nzToday} from '../../shared/postingDates'
// AI job assistant — turn a natural spoken/typed description into a job draft.
import { supabase } from './supabase'

export async function draftJobFromText(text) {
  const today = nzToday()
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

  const scheduledDate = draft.schedule_type === 'specific' ? nzCalendarDay(draft.scheduled_date) : null

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
    return `${nzMoney(draft.budget_low)}–${nzMoney(draft.budget_high)}${draft.price_type === 'open' ? ' · open to offers' : ''}`
  }
  if (draft.budget_low) return `Around ${nzMoney(draft.budget_low)}`
  return 'Open to offers'
}
