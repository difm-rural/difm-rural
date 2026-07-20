import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/')

  return (
    <main className="login-page">
      <section className="login-brand">
        <p className="eyebrow light">Rural Connections</p>
        <h1>Keep a clear view of the rural marketplace.</h1>
        <p>Monitor demand, work in progress, service supply and campaign performance from one secure console.</p>
        <div className="login-rule" />
        <p className="login-note">Restricted to authorised Rural Connections administrators.</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="brand-mark">RC</div>
          <p className="eyebrow">Admin console</p>
          <h2>Welcome back</h2>
          <p className="muted">Use the same email address as your administrator account in the app.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  )
}
