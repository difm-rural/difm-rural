'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Global AI connector switch. Off: every rc-mcp tool call is refused.
export async function setAiEnabled(formData: FormData) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.rpc('ai_admin_set_enabled', { p_enabled: formData.get('enabled') === 'true' })
  revalidatePath('/assistants')
  redirect('/assistants?result=' + (error ? 'error' : 'saved'))
}

// Pause / resume one member's assistant access (their connections stay; calls are refused).
export async function setMemberPause(formData: FormData) {
  const { supabase } = await requireAdmin()
  const userId = String(formData.get('user_id') || '')
  if (!UUID.test(userId)) redirect('/assistants?result=error')
  const { error } = await supabase.rpc('ai_admin_set_member_pause', {
    p_user_id: userId,
    p_paused: formData.get('paused') === 'true',
    p_reason: String(formData.get('reason') || '').slice(0, 300) || null,
  })
  revalidatePath('/assistants')
  redirect('/assistants?result=' + (error ? 'error' : 'saved'))
}

// Hidden beta: members on this list can use the connector while AI access is
// off for everyone else, and see Account → Connected assistants.
export async function setBetaMember(formData: FormData) {
  const { supabase } = await requireAdmin()
  const email = String(formData.get('email') || '').trim().slice(0, 320)
  if (!email.includes('@')) redirect('/assistants?result=beta_email')
  const { error } = await supabase.rpc('ai_admin_set_beta', {
    p_email: email,
    p_on: formData.get('on') !== 'false',
    p_note: String(formData.get('note') || '').slice(0, 200) || null,
  })
  revalidatePath('/assistants')
  redirect('/assistants?result=' + (error ? (error.code === 'P0002' ? 'beta_missing' : 'error') : 'saved'))
}
