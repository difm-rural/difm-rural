'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
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

  if (sent) {
    return (
      <div className="login-confirmation">
        <CheckCircle2 size={26} />
        <div>
          <h2>Check your inbox</h2>
          <p>We sent a secure sign-in link to {email}.</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label htmlFor="email">Admin email</label>
      <input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@ruralconnections.nz" required autoComplete="email" />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}
        Send secure sign-in link
        {!loading && <ArrowRight size={17} />}
      </button>
    </form>
  )
}
