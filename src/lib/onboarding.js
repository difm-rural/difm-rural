export const ONBOARDING_DESTINATIONS = {
  home: { tab: 'Home', screen: 'Dashboard' },
  post_job: { tab: 'Jobs', screen: 'PostJob', params: { origin: 'Home' } },
  listings: { tab: 'Browse', screen: 'BrowseMain' },
}

export function onboardingPublicProfile(publicName, location) {
  const name = publicName.trim()
  if (!name) throw new Error('Enter the name you want others to see.')
  if (!location.trim()) throw new Error('Enter your town or region. You can type it if search is unavailable.')
  // Existing cards use full_name, while some profile views use display_name.
  // Keep the public identity consistent without requiring two name fields.
  return { full_name: name, display_name: name }
}

export async function completeOnboarding(supabase) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user?.id) throw new Error('Please sign in again to finish setup.')
  const { data, error } = await supabase.from('profiles')
    .update({ onboarding_completed: true, primary_role: 'both', role: 'provider' })
    .eq('id', user.id)
    .select('id')
    .single()
  if (error) throw error
  if (data?.id !== user.id) throw new Error('Your profile could not be saved. Please try again.')
}
