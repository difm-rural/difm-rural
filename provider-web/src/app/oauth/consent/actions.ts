'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { authorizationId, consentPath, loginPathForConsent, safeRedirect } from '@/lib/oauth-consent'

// Allow / Deny on the consent screen. Supabase Auth returns the assistant's
// redirect URL (with a code on Allow, access_denied on Deny); we send the
// browser there.
async function decide(data: FormData, approve: boolean) {
  const id = authorizationId(data.get('authorization_id'))
  if (!id) redirect('/oauth/consent?error=request')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(loginPathForConsent(id))
  const result = approve
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
  const target = result.error ? null : safeRedirect(result.data?.redirect_url)
  if (!target) redirect(consentPath(id) + '&error=decision')
  redirect(target)
}

export async function allowAssistant(data: FormData) { await decide(data, true) }
export async function denyAssistant(data: FormData) { await decide(data, false) }
