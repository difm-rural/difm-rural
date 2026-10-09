import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Gate the provider app. A provider is a normal Supabase user whose profile
// primary_role is 'provider' or 'both' (legacy accounts fall back to `role`).
// Non-providers are sent to /providers-only, not an admin-style /not-authorised.
export async function requireProvider() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, primary_role, role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.primary_role ?? profile?.role
  if (role !== 'provider' && role !== 'both') redirect('/providers-only')

  return { supabase, user, profile }
}
