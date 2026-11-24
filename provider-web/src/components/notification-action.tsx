'use client'
import {useActionState, useState, useTransition} from 'react'
import {
  Bell, Briefcase, CalendarDays, Car, Check, CheckCheck, CircleAlert, CircleCheck, CircleHelp, CircleX,
  CreditCard, FileText, Bookmark, Banknote, MailOpen, MessageSquare, Star, Trophy, type LucideIcon,
} from 'lucide-react'
import type {NotificationIconKey} from '@shared/notificationIcons'
import type {MarketSide} from '@shared/marketSide'
import Link from './navigation-link'
import {useNavigationFeedback} from './navigation-feedback'
import type {ActionState} from './action-form'

const ICONS:Record<NotificationIconKey,LucideIcon>={
  briefcase:Briefcase, cash:Banknote, invite:MailOpen, trophy:Trophy, declined:CircleX, alert:CircleAlert,
  bell:Bell, done:CircleCheck, 'done-all':CheckCheck, star:Star, question:CircleHelp, chat:MessageSquare,
  document:FileText, bookmark:Bookmark, calendar:CalendarDays, car:Car, card:CreditCard,
}

export type NotificationRowData={
  id:string; type:string; href:string; read:boolean; body:string
  iconKey:NotificationIconKey; side:MarketSide|null; tag:string|null
  created_at:string; relative:string; fullDate:string
}

type MarkRead=(id:string,options?:{includeMessages?:boolean})=>Promise<{ok:boolean}>
type AnswerAvailability=(id:string,status:string)=>Promise<ActionState>

// One notification. The link covers the whole row; opening it marks the notice
// read in the background (message notices are marked read by the conversation
// itself), so navigation never waits on the update.
export function NotificationRow({n,markRead,answerAvailability}:{n:NotificationRowData;markRead:MarkRead;answerAvailability?:AnswerAvailability}){
  const feedback=useNavigationFeedback()
  const [read,setRead]=useState(n.read)
  const [error,setError]=useState('')
  const [answered,setAnswered]=useState<string|null>(null)
  const [pending,startTransition]=useTransition()
  const unread=!read && !n.read
  const navigating=!!feedback.pending && feedback.pending.href===n.href.split('#')[0]
  const busy=pending || navigating
  const Icon=ICONS[n.iconKey] || Bell

  function open(){
    if(!unread || n.type==='new_message')return
    setRead(true)
    markRead(n.id).catch(()=>{})
  }
  function markOne(){
    setError('');setRead(true)
    startTransition(async()=>{
      try { const r=await markRead(n.id,{includeMessages:true}); if(!r.ok){setRead(false);setError('Could not mark this read. Try again.')} }
      catch { setRead(false);setError('Could not mark this read. Check your connection.') }
    })
  }
  function answer(status:string){
    setError('')
    startTransition(async()=>{
      try {
        const r=await answerAvailability!(n.id,status)
        if(r.error)setError(r.error)
        else {setAnswered(status);setRead(true)}
      } catch { setError('Could not save availability. Check your connection.') }
    })
  }

  return <li className={'notification-item'+(unread?' unread':'')+(n.side?' '+n.side:'')} aria-busy={busy || undefined}>
    <Link href={n.href} className="notification-link" onClick={open} onAuxClick={event=>{if(event.button===1)open()}}>
      <span className={'notification-icon'+(n.side?' '+n.side:'')} aria-hidden="true"><Icon size={17}/></span>
      <span className="notification-text">
        {n.tag && <span className={'notification-tag '+n.side}>{n.tag}</span>}
        <span className="notification-body">{unread && <span className="sr-only">Unread: </span>}{n.body}</span>
        <time dateTime={n.created_at} title={n.fullDate}>{n.relative}</time>
      </span>
      {unread && <span className="notification-dot" aria-hidden="true"/>}
    </Link>
    {unread && <button type="button" className="notification-mark" onClick={markOne} disabled={pending} aria-label="Mark read" title="Mark read"><Check size={15}/></button>}
    {answerAvailability && (unread || answered) && <div className="notification-quick">
      {answered
        ? <p role="status">Updated: {answered==='limited'?'Limited availability':'Available this week'}</p>
        : <>
          <button type="button" className="lform-save" disabled={pending} onClick={()=>answer('available_this_week')}>Available this week</button>
          <button type="button" className="lform-cancel" disabled={pending} onClick={()=>answer('limited')}>Limited</button>
        </>}
    </div>}
    {error && <p className="form-error notification-error" role="alert">{error}</p>}
  </li>
}

export function MarkAllRead({action,cutoff}:{action:(state:ActionState,data:FormData)=>Promise<ActionState>;cutoff:string}){
  const [state,submit,pending]=useActionState(action,{error:''})
  return <form action={submit} className="notification-mark-all" aria-busy={pending || undefined}>
    <input type="hidden" name="all" value="true"/><input type="hidden" name="cutoff" value={cutoff}/>
    <button className="lform-cancel" disabled={pending}><CheckCheck size={15}/> {pending?'Marking…':'Mark all read'}</button>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
  </form>
}
