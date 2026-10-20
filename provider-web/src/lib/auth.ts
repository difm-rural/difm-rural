import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeReturnPath } from '@/lib/return-path'

// Any signed-in member can use the console. New members complete or defer
// setup before continuing to their original destination.
export async function requireProvider(returnTo='/', allowSetup=false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login'+(returnTo==='/'?'':'?next='+encodeURIComponent(safeReturnPath(returnTo))))

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, region, onboarding_completed, primary_role, role')
    .eq('id', user.id)
    .maybeSingle()

  if(error || !profile)throw new Error('Could not load your profile. Please refresh and try again.')
  if(!allowSetup && profile.onboarding_completed===false)redirect('/setup?next='+encodeURIComponent(safeReturnPath(returnTo)))

  return { supabase, user, profile }
}
