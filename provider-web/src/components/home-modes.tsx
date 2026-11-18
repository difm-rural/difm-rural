'use client'

import {useEffect,useState,type ReactNode} from 'react'
import {HOME_MODES,homeMode,homeModeKey,type HomeMode} from '@shared/homeMode'

export function HomeModes({owner,property,work,refresh}:{owner:string;property:ReactNode;work:ReactNode;refresh:ReactNode}){
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
    {HOME_MODES.map(item=><button key={item.id} type="button" aria-pressed={mode===item.id} onClick={()=>choose(item.id)}>{item.label}</button>)}
   </div>
   {refresh}
  </div>
  <div hidden={mode!=='property'}>{property}</div>
  <div hidden={mode!=='work'}>{work}</div>
 </>
}
