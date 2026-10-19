import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'
import { safeReturnPath } from '@/lib/return-path'

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const destination=safeReturnPath((await searchParams).next)
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
        <p className="login-note">For Rural Connections members. Sign in with the same email you use in the app.</p>
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
          <h2>Welcome back</h2>
          <p className="muted">Use the same email as your account in the app. We will email you a one-time sign-in code.</p>
          <LoginForm destination={destination}/>
        </div>
      </section>
    </main>
  )
}
