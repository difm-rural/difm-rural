'use client'

import {useEffect,useState,type ReactNode} from 'react'
import {HOME_MODES,homeMode,homeModeKey,type HomeMode} from '@shared/homeMode'

// `attention` = items needing action in each mode. Home remembers the last mode,
// so the other mode's count is the only hint that something is waiting there.
export function HomeModes({owner,property,work,refresh,attention}:{owner:string;property:ReactNode;work:ReactNode;refresh:ReactNode;attention?:Partial<Record<HomeMode,number>>}){
 const [mode,setMode]=useState<HomeMode>('property')
 useEffect(()=>{
  try{setMode(homeMode(localStorage.getItem(homeModeKey(owner))))}catch{setMode('property')}
 },[owner])
 function choose(value:HomeMode){
  setMode(value)
  try{localStorage.setItem(homeModeKey(owner),value)}catch{/* Home remains usable with storage disabled. */}
 }
 return <>
  <div className="home-mode-row">
   <div className="home-mode-toggle" role="group" aria-label="Home mode">
    {HOME_MODES.map(item=>{const count=attention?.[item.id]||0;return <button key={item.id} type="button" aria-pressed={mode===item.id} onClick={()=>choose(item.id)} aria-label={count?item.label+', '+count+(count===1?' item needs':' items need')+' your attention':undefined}>{item.label}{count>0&&<span className="home-mode-count" aria-hidden="true">{count}</span>}</button>})}
   </div>
   {refresh}
  </div>
  <div hidden={mode!=='property'}>{property}</div>
  <div hidden={mode!=='work'}>{work}</div>
 </>
}
