'use client'
import {useEffect,useState} from 'react'

// Shown under a submit button once a save has taken longer than a moment, so
// a slow save reads as "still working" rather than stuck.
export function PendingNote({pending,delay=1500,text='Still saving — this can take a few seconds. Please keep this page open.'}:{pending:boolean;delay?:number;text?:string}){
 const [slow,setSlow]=useState(false)
 useEffect(()=>{
  if(!pending)return
  const timer=setTimeout(()=>setSlow(true),delay)
  return ()=>{clearTimeout(timer);setSlow(false)}
 },[pending,delay])
 return <p className="muted pending-note" role="status" aria-live="polite">{pending&&slow?text:''}</p>
}
