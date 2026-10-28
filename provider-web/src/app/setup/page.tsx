import { requireProvider } from '@/lib/auth'
import { setupDestination } from '@/lib/first-time'
import { SetupForm } from './setup-form'
import {AppShell} from '@/components/app-shell'
export default async function SetupPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const next=setupDestination((await searchParams).next)
  const {profile,user}=await requireProvider('/setup?next='+encodeURIComponent(next),true)
  return <AppShell providerName={profile.full_name || 'Member'} setupMode><section className="page work-page setup-page"><p className="eyebrow">Rural Connections</p><h1>Complete your profile</h1><p>Save your public name and town or region, or finish setup later.</p>
    <section className="card account-form-section"><h2>Your public profile</h2><SetupForm name={profile.full_name || ''} region={profile.region || ''} next={next}/></section>
    <details className="card account-form-section setup-explainer"><summary>Jobs & listings — how it works</summary><p><strong>Jobs</strong> are work you need done. Local people send you offers.</p><p><strong>Listings</strong> advertise services, grazing, hire and local goods. Send an enquiry or booking request to arrange the details.</p><p>Agree timing, the final price and payment directly with the other person.</p></details>
    <p className="muted">Signed in as {user.email}. <a className="card-link" href="/auth/signout">Use a different account</a></p>
  </section></AppShell>
}
