'use client'
import {useEffect, useRef, useState, type ReactNode} from 'react'
import {useRouter} from 'next/navigation'
import type {ActionState} from './action-form'
import {useNavigationFeedback} from './navigation-feedback'

// Navigation belongs to the page that initiated the action, never a late
// server redirect after the user has pressed Back or chosen another section.
export function NotificationAction({action,label,children}: {
  action:(state:ActionState,data:FormData)=>Promise<ActionState & {href?:string}>
  label:string
  children?:ReactNode
}) {
  const router=useRouter(),feedback=useNavigationFeedback()
  const [state,setState]=useState<ActionState>({error:''})
  const [pending,setPending]=useState(false)
  const active=useRef(true),locked=useRef(false)
  useEffect(()=>{
    active.current=true
    const cancel=()=>{active.current=false}
    const link=(event:MouseEvent)=>{
      if((event.target as Element)?.closest?.('a[href]'))cancel()
    }
    window.addEventListener('popstate',cancel)
    window.addEventListener('pagehide',cancel)
    document.addEventListener('click',link,true)
    return ()=>{
      cancel()
      window.removeEventListener('popstate',cancel)
      window.removeEventListener('pagehide',cancel)
      document.removeEventListener('click',link,true)
    }
  },[])
  useEffect(()=>{if(feedback.pending)active.current=false},[feedback.pending])
  return <form className="lform" onSubmit={async event=>{
    event.preventDefault()
    if(locked.current)return
    locked.current=true;active.current=true;setPending(true);setState({error:''})
    const data=new FormData(event.currentTarget)
    try {
      const result=await action({error:''},data)
      if(!active.current)return
      setState(result)
      if(result.href){feedback.begin(result.href);router.push(result.href)}
    } catch {
      if(active.current)setState({error:'Could not update this notification. Check your connection and try again.'})
    } finally {
      locked.current=false
      if(active.current)setPending(false)
    }
  }}>
    {children}
    {state.error&&<p className="form-error" role="alert">{state.error}</p>}
    {state.success&&<p className="home-clear" role="status">{state.success}</p>}
    <button className="lform-save" disabled={pending} aria-busy={pending}>{pending?(label==='View details'||label==='Open conversation'?'Opening…':'Marking read…'):label}</button>
    {pending&&<p className="muted" role="status">You can leave this page. It won&apos;t open anything after you leave.</p>}
  </form>
}
