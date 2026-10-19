import Link from 'next/link'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { PRIVATE_PROFILE_COLUMNS } from '@/lib/profile-input'
import { ProfileForm, type OwnProfile } from './profile-form'
export default async function EditProfilePage(){
  const {supabase,user,profile}=await requireProvider()
  const {data,error}=await supabase.from('profiles').select(PRIVATE_PROFILE_COLUMNS).eq('id',user.id).single()
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/account" className="card-link">Back to Account</Link><h1>Edit profile</h1>
    {error || !data?<p role="alert">Could not load your profile. Refresh to try again; no changes have been made.</p>:<ProfileForm profile={data as unknown as OwnProfile} userId={user.id}/>}
  </section></AppShell>
}
