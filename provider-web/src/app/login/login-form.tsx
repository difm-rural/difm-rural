'use client'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normaliseEmail, validEmail, signInFailure } from '@/lib/first-time'
export function LoginForm({destination='/'}:{destination?:string}){
 const [email,setEmail]=useState(''),[token,setToken]=useState(''),[sent,setSent]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[remaining,setRemaining]=useState(0)
 const busy=useRef(false),until=useRef(0)
 useEffect(()=>{const timer=setInterval(()=>setRemaining(Math.max(0,Math.ceil((until.current-Date.now())/1000))),1000);return ()=>clearInterval(timer)},[])
 async function send(event?:FormEvent){
  event?.preventDefault()
  if(busy.current || Date.now()<until.current)return
  const address=normaliseEmail(email)
  if(!validEmail(address)){setError('Enter a valid email address, such as you@example.co.nz.');return}
  busy.current=true;setLoading(true);setError('');setNotice('')
  try{
   const {error:failure}=await createClient().auth.signInWithOtp({email:address,options:{emailRedirectTo:window.location.origin+'/auth/callback?next='+encodeURIComponent(destination)}})
   if(failure){setError(signInFailure(failure));if(failure.status===429){until.current=Date.now()+60000;setRemaining(60)}}
   else{setEmail(address);setSent(true);setToken('');until.current=Date.now()+60000;setRemaining(60);setNotice('Code sent. Check your inbox and junk folder. Use the most recent code.')}
  }catch{setError(signInFailure(null))}finally{busy.current=false;setLoading(false)}
 }
 async function verify(event:FormEvent){
  event.preventDefault();if(busy.current)return
  if(!/^\d{6,8}$/.test(token)){setError('Enter the complete code from your email.');return}
  busy.current=true;setLoading(true);setError('');setNotice('')
  let signedIn=false
  try{const {error:failure}=await createClient().auth.verifyOtp({email,token,type:'email'});if(failure)setError(signInFailure(failure,true));else{signedIn=true;window.location.assign(destination)}}
  catch{setError(signInFailure(null,true))}finally{if(!signedIn){busy.current=false;setLoading(false)}}
 }
 return <form onSubmit={sent?verify:send} className="login-form" noValidate>
  {sent?<><h2>Enter your sign-in code</h2><p>Sent to {email}. You can paste the whole code.</p><label htmlFor="token">Email code</label><input id="token" className="otp-input" value={token} onChange={e=>setToken(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8}/></>:<><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.co.nz"/></>}
  {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="muted" role="status">{notice}</p>}
  <button disabled={loading || (sent ? token.length<6 : remaining>0)}>{loading?'Please wait…':sent?'Verify and sign in':remaining>0?'Send code in '+remaining+'s':'Send sign-in code'}</button>
  {sent && <><button type="button" className="resend-code" disabled={loading || remaining>0} onClick={()=>void send()}>{remaining>0?'Resend code in '+remaining+'s':'Resend code'}</button><button type="button" className="resend-code" disabled={loading} onClick={()=>{setSent(false);setToken('');setError('');setNotice('')}}>Use a different email</button></>}
 </form>
}
