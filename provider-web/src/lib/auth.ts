import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeReturnPath } from '@/lib/return-path'

// Gate the provider console. The requester/provider split is retired for now, so any
// signed-in user may use it — the only gate is authentication. (The /providers-only
// route is left in place but is now unreachable from here.) The profile is still
// fetched and returned for the shell's display name.
export async function requireProvider(returnTo='/') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login'+(returnTo==='/'?'':'?next='+encodeURIComponent(safeReturnPath(returnTo))))

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, primary_role, role')
    .eq('id', user.id)
    .maybeSingle()

  return { supabase, user, profile }
}
