'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireProvider } from '@/lib/auth'

const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Disconnect: revokes the member's consent for that assistant. Supabase Auth
// deletes its sessions and refresh tokens; rc-mcp also refuses any access token
// whose session is gone, so the assistant stops working straight away.
export async function disconnectAssistant(data: FormData) {
  const clientId = String(data.get('client_id') || '')
  if (!CLIENT_ID.test(clientId)) redirect('/account/assistants?result=error')
  const { supabase } = await requireProvider('/account/assistants')
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
  revalidatePath('/account/assistants')
  redirect('/account/assistants?result=' + (error ? 'error' : 'disconnected'))
}
