'use client'

import { useState } from 'react'
import { providerProfileUrl, shareProviderLink } from '@shared/trustedLocals'

export function ShareProvider({providerId}:{providerId:string}){
 const url=providerProfileUrl(providerId)
 const [feedback,setFeedback]=useState('')
 const [manual,setManual]=useState(false)
 async function share(copyOnly=false){
  const result=await shareProviderLink(!copyOnly&&navigator.share?navigator.share.bind(navigator):undefined,navigator.clipboard?.writeText.bind(navigator.clipboard),url)
  if(result==='cancelled')return
  setManual(result==='manual')
  setFeedback(result==='copied'?'Profile link copied.':result==='manual'?'Select and copy the profile link.':'Profile shared.')
 }
 return <div className="lform-actions">
  <button type="button" className="lform-cancel" onClick={()=>void share()}>Share profile</button>
  <button type="button" className="lform-cancel" onClick={()=>void share(true)}>Copy link</button>
  {feedback&&<span role="status">{feedback}</span>}
  {manual&&<input aria-label="Public profile link" value={url} readOnly onFocus={event=>event.target.select()}/>}
 </div>
}
