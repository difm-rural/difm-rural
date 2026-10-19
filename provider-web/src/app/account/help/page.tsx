import Link from 'next/link'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { Feedback } from './feedback'
import { version } from '../../../../package.json'
export default async function HelpPage(){
  const {profile}=await requireProvider()
  const build=process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7) || process.env.NEXT_PUBLIC_BUILD_ID || 'Development'
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/account" className="card-link">Back to Account</Link><h1>Help & feedback</h1>
    <section className="card account-form-section"><h2>How it works</h2><h3>Need something done? Post a job.</h3><p>Describe the work. Local people send offers, and you choose who to go with.</p><Link href="/jobs/new" className="card-link">Post a job →</Link>
      <h3>Got something to offer? Create a listing.</h3><p>Advertise services, grazing, hire, space or goods. People can enquire or send a booking request where booking is supported.</p><Link href="/listings/new" className="card-link">Create a listing →</Link>
      <h3>Track arrangements in Activity.</h3><p>Review requests and quotes, manage work, complete arrangements and leave reviews. Find current work in Active and closed work in History.</p><Link href="/activity" className="card-link">Open Activity →</Link>
    </section>
    <section className="card account-form-section"><h2>Common questions</h2>
      <details className="account-skills"><summary>When is a booking confirmed?</summary><p>A booking request is pending until the provider accepts. If a quote is required, review and accept the quote to confirm the booking.</p></details>
      <details className="account-skills"><summary>How do payments work?</summary><p>Agree the price, extras, timing and payment directly with the other person. Rural Connections does not handle payments.</p></details>
      <details className="account-skills"><summary>Who can see my contact details?</summary><p>Your public profile shows your public name, photo, region, bio, capabilities, qualifications, availability and reviews. Phone, profile address and GPS coordinates are excluded. A job&apos;s location follows the privacy settings chosen when posting it.</p></details>
      <details className="account-skills"><summary>Where can I find a conversation?</summary><p>Open Messages for listing enquiries, jobs and booking conversations. A conversation appears after your first message, even before the other person replies.</p><Link href="/messages" className="card-link">Open Messages →</Link></details>
      <details className="account-skills"><summary>Why am I not receiving job opportunity alerts?</summary><p>Check that alerts are enabled, your capabilities and private GPS location are saved, and your work availability is current. For phone push alerts, notification permissions must also be enabled on the installed app.</p><Link href="/account/notifications" className="card-link">Check preferences →</Link></details>
    </section>
    <Feedback version={version} build={build}/><p className="muted">Web console version {version} · Build {build}</p><a href="https://ruralconnections.nz/privacy" className="card-link" target="_blank" rel="noopener noreferrer">Privacy policy ↗</a>
  </section></AppShell>
}
