'use client'
import {useState} from 'react'
export function ShareJob({title,publicJob=false}:{title:string;publicJob?:boolean}){
 const [message,setMessage]=useState(''),[fallback,setFallback]=useState('')
 async function share(){const url=(publicJob?'https://ruralconnections.nz':window.location.origin)+window.location.pathname;try{if(navigator.share){await navigator.share({title,url});setMessage('Share opened.')}else{await navigator.clipboard.writeText(url);setMessage('Job link copied.')}}catch(e){if(e instanceof Error&&e.name==='AbortError')return;setFallback(url);setMessage('Copy the link below to share this job.')}}
 return <div><button type="button" className="lform-cancel" onClick={()=>void share()}>Share job</button>{message&&<p role="status" className="muted">{message}</p>}{fallback&&<input aria-label="Job link" readOnly value={fallback} onFocus={e=>e.target.select()}/>}</div>
}
