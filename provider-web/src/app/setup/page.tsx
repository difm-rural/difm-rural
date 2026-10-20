import { requireProvider } from '@/lib/auth'
import { setupDestination } from '@/lib/first-time'
import { SetupForm } from './setup-form'
export default async function SetupPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const next=setupDestination((await searchParams).next)
  const {profile,user}=await requireProvider('/setup?next='+encodeURIComponent(next),true)
  return <main className="page work-page setup-page"><p className="eyebrow">Rural Connections</p><h1>Make yourself at home</h1><p>Just your name and location to get started.</p>
    <section className="card account-form-section"><h2>Jobs & listings</h2><p><strong>Jobs</strong> are work you need done. Local people send you offers.</p><p><strong>Listings</strong> advertise services, grazing, hire and local goods. Send an enquiry or booking request to arrange the details.</p><p>Agree timing, the final price and payment directly with the other person.</p></section>
    <section className="card account-form-section"><h2>Your public profile</h2><SetupForm name={profile.full_name || ''} region={profile.region || ''} next={next}/></section>
    <p className="muted">Signed in as {user.email}. <a className="card-link" href="/auth/signout">Use a different account</a></p>
  </main>
}
