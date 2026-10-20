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
            <svg viewBox="0 0 96 96" role="img">
              <rect width="96" height="96" rx="24" fill="#245c45" />
              <path d="M26 42.5V68h44V42.5L48 31 26 42.5Z" fill="white" />
              <path d="M22 42 48 28l26 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter" />
              <path d="M42 49h14v19H42z" fill="#245c45" />
            </svg>
          </div>
          <p className="eyebrow">Web console</p>
          <h2>Welcome to Rural Connections</h2>
          <p className="muted">Sign in or create an account with your email. We will send a one-time code; no password needed.</p>
          {params.error==='link' && <p className="form-error" role="alert">That sign-in link could not be used. Request a new code below and enter it here.</p>}
          <LoginForm destination={destination}/>
        </div>
      </section>
    </main>
  )
}
