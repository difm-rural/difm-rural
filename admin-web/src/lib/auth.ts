import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/not-authorised')
  return { supabase, user, profile }
}
