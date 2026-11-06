'use client'

import { FormEvent, useState } from 'react'
import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Local copy of the shared password-login list (admin-web has no @shared alias).
// Public identifiers only — passwords live only in Supabase. Admin access is still
// gated by profiles.is_admin, so a non-admin bot signs in but can't reach the console.
const PASSWORD_LOGIN_EMAILS = ['review@ruralconnections.nz', 'adminbot@ruralconnections.nz', 'requesterbot@ruralconnections.nz']
const isPasswordAccount = (email: string) => PASSWORD_LOGIN_EMAILS.includes(email.trim().toLowerCase())

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [passwordStage, setPasswordStage] = useState(false)
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (isPasswordAccount(email)) { setEmail(email.trim().toLowerCase()); setPasswordStage(true); setError('') ; return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (signInError) setError(signInError.message)
    else setSent(true)
  }

  async function signInWithPassword(event: FormEvent) {
    event.preventDefault()
    if (!password) { setError('Enter the account password to sign in.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: failure } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setLoading(false)
    if (failure || !data.session) setError('The email or password was not recognised. Check your details and try again.')
    else { setPassword(''); window.location.assign('/') }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: token.trim(),
      type: 'email',
    })
    setLoading(false)
    if (verifyError) setError('That code is invalid or has expired. Request a new code and try again.')
    else window.location.assign('/')
  }

  if (passwordStage) {
    return (
      <form onSubmit={signInWithPassword} className="login-form otp-form">
        <div className="otp-heading">
          <button type="button" className="back-email" onClick={() => { setPasswordStage(false); setPassword(''); setError('') }} aria-label="Use a different email"><ArrowLeft size={16} /></button>
          <div><h2>Enter your password</h2><p>Sign in as {email}.</p></div>
        </div>
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required autoFocus />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={loading || !password}>
          {loading ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}
          Sign in
          {!loading && <ArrowRight size={17} />}
        </button>
      </form>
    )
  }

  if (sent) {
    return (
      <form onSubmit={verify} className="login-form otp-form">
        <div className="otp-heading">
          <button type="button" className="back-email" onClick={() => { setSent(false); setToken(''); setError('') }} aria-label="Use a different email"><ArrowLeft size={16} /></button>
          <div><h2>Enter your sign-in code</h2><p>We sent a code to {email}.</p></div>
        </div>
        <label htmlFor="token">Email code</label>
        <input id="token" className="otp-input" value={token} onChange={event => setToken(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" required autoFocus />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={loading || token.length < 6}>
          {loading ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}
          Verify and sign in
          {!loading && <ArrowRight size={17} />}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label htmlFor="email">Admin email</label>
      <input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@ruralconnections.nz" required autoComplete="email" />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}
        Continue
        {!loading && <ArrowRight size={17} />}
      </button>
    </form>
  )
}
