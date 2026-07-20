'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { AUDIENCES, CAMPAIGN_ACTIONS, CATEGORIES } from '@/lib/categories'

async function audit(action: string, entityId: string | null, before: unknown, after: unknown) {
  const { supabase, user } = await requireAdmin()
  await supabase.from('admin_audit_log').insert({
    admin_id: user.id, action, entity_type: 'seasonal_campaign', entity_id: entityId,
    before_data: before, after_data: after,
  })
}

export async function toggleCampaign(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const id = String(formData.get('id') || '')
  const active = formData.get('active') === 'true'
  const { data: before } = await supabase.from('seasonal_campaigns').select('*').eq('id', id).single()
  const { data: after, error } = await supabase.from('seasonal_campaigns').update({ is_active: active, updated_by: user.id }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  await audit(active ? 'campaign.activate' : 'campaign.pause', id, before, after)
  revalidatePath('/campaigns')
  revalidatePath('/')
}

export async function updateCampaignSettings(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const { data: before } = await supabase.from('seasonal_reminder_settings').select('*').eq('singleton', true).single()
  const maxCards = Number(formData.get('max_cards_per_month') || 0)
  const maxEmails = Number(formData.get('max_emails_per_month') || 0)
  if (!Number.isInteger(maxCards) || maxCards < 0 || maxCards > 10) throw new Error('Card limit must be from 0 to 10.')
  if (!Number.isInteger(maxEmails) || maxEmails < 0 || maxEmails > 5) throw new Error('Email limit must be from 0 to 5.')
  const payload = {
    in_app_enabled: formData.get('in_app_enabled') === 'on',
    email_enabled: formData.get('email_enabled') === 'on',
    push_enabled: formData.get('push_enabled') === 'on',
    max_cards_per_month: maxCards,
    max_emails_per_month: maxEmails,
    updated_by: user.id,
  }
  const { data: after, error } = await supabase.from('seasonal_reminder_settings').update(payload).eq('singleton', true).select().single()
  if (error) throw new Error(error.message)
  await supabase.from('admin_audit_log').insert({ admin_id: user.id, action: 'campaign.settings.update', entity_type: 'seasonal_settings', entity_id: 'global', before_data: before, after_data: after })
  revalidatePath('/campaigns')
}

export async function saveCampaign(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const id = String(formData.get('id') || '')
  const title = String(formData.get('title') || '').trim()
  const body = String(formData.get('body') || '').trim()
  if (title.length < 3 || body.length < 3) throw new Error('A title and message are required.')

  const category = String(formData.get('category') || '')
  const audience = String(formData.get('audience') || '')
  const primaryAction = String(formData.get('primary_action') || '')
  const startsOn = String(formData.get('starts_on') || '')
  const endsOn = String(formData.get('ends_on') || '')
  const priority = Number(formData.get('priority') || 20)
  const inAppEnabled = formData.get('in_app_enabled') === 'on'
  const emailEnabled = formData.get('email_enabled') === 'on'
  const pushEnabled = formData.get('push_enabled') === 'on'
  if (!CATEGORIES.includes(category)) throw new Error('Select a valid category.')
  if (!(AUDIENCES as readonly string[]).includes(audience)) throw new Error('Select a valid audience.')
  if (!(CAMPAIGN_ACTIONS as readonly string[]).includes(primaryAction)) throw new Error('Select a valid campaign action.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) throw new Error('Enter a valid campaign date range.')
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new Error('Priority must be from 0 to 100.')
  if (!inAppEnabled && !emailEnabled && !pushEnabled) throw new Error('Enable at least one delivery channel.')

  const payload = {
    title, body,
    category,
    capability: String(formData.get('capability') || '').trim() || null,
    audience,
    regions: String(formData.get('regions') || '').split(',').map(value => value.trim()).filter(Boolean),
    starts_on: startsOn,
    ends_on: endsOn,
    primary_action: primaryAction,
    priority,
    in_app_enabled: inAppEnabled,
    email_enabled: emailEnabled,
    push_enabled: pushEnabled,
    is_active: formData.get('is_active') === 'on',
    updated_by: user.id,
  }

  if (id) {
    const { data: before } = await supabase.from('seasonal_campaigns').select('*').eq('id', id).single()
    const { data: after, error } = await supabase.from('seasonal_campaigns').update(payload).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    await audit('campaign.update', id, before, after)
  } else {
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'campaign'}-${Date.now()}`
    const { data: after, error } = await supabase.from('seasonal_campaigns').insert({ ...payload, slug, created_by: user.id }).select().single()
    if (error) throw new Error(error.message)
    await audit('campaign.create', after.id, null, after)
  }
  revalidatePath('/campaigns')
  revalidatePath('/')
  redirect('/campaigns')
}
