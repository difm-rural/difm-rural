import Image from 'next/image'
import {DevelopmentBadge} from '@/components/development-badge'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'
import { safeReturnPath } from '@/lib/return-path'

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string;error?:string}>}) {
  const params=await searchParams
  const destination=safeReturnPath(params.next)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(destination)

  return (
    <main className="login-page">
      <section className="login-brand">
        <p className="eyebrow light">Rural Connections</p>
        <h1>Find help. Find work. Stay connected.</h1>
        <p>Post jobs, discover local listings and manage your arrangements from the web console.</p>
        <div className="login-rule" />
        <p className="login-note">New here? Your first sign-in creates your account. Already use the app? Use the same email to keep everything together.</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-barn-mark" aria-hidden="true">
            <Image src="/brand/barn-badge-red.png" alt="" width={52} height={52} priority />
          </div>
          <p className="eyebrow">Your account <DevelopmentBadge/></p>
          <h2>Welcome to Rural Connections</h2>
          <p className="muted">Sign in or create an account with your email. We will send a one-time code; no password needed.</p>
          {params.error==='link' && <p className="form-error" role="alert">That sign-in link could not be used. Request a new code below and enter it here.</p>}
          <LoginForm destination={destination}/>
          <p className="muted">Once signed in, Home brings your jobs, listings, messages and bookings together.</p>
          <a href="https://ruralconnections.nz/" className="card-link">Continue browsing without signing in →</a>
        </div>
      </section>
    </main>
  )
}
