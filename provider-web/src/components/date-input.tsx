'use client'
import {useEffect,useRef,useState,type ComponentProps} from 'react'
import {parseNzDate} from '@shared/dates'

// Unambiguous NZ caption for an ISO date, e.g. "Wed 11 Nov 2026".
function caption(iso:string){
 const [y,m,d]=iso.split('-').map(Number)
 const dt=new Date(Date.UTC(y,(m||1)-1,d||1))
 if(Number.isNaN(dt.getTime()))return ''
 return dt.toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).replace(',','')
}

// A date field that prefers the native picker (type="date", which submits ISO).
// If the browser has no native date support (the input reports type!=='date'
// after mount), it falls back to a free-text field — "e.g. 11 Nov 2026" — and
// submits the parseNzDate result through a hidden input of the same `name`, so
// every form still receives an ISO date.
export function DateInput({onChange,value,defaultValue,name,...props}:ComponentProps<'input'>){
 const [textMode,setTextMode]=useState(false)
 const [selected,setSelected]=useState(defaultValue)          // native-mode caption
 const [text,setText]=useState(()=>String(value??defaultValue??''))  // text-mode value
 const probe=useRef<HTMLInputElement>(null)
 useEffect(()=>{ if(probe.current && probe.current.type!=='date') setTextMode(true) },[])

 if(!textMode){
  const date=value??selected
  return <span className="date-control">
   <input {...props} ref={probe} name={name} lang="en-NZ" value={value} defaultValue={defaultValue}
    onChange={e=>{setSelected(e.target.value);onChange?.(e)}} type="date"/>
   <small className="muted" aria-live="polite">{date?caption(String(date)):'Choose a date — e.g. 1 Dec 2026'}</small>
  </span>
 }

 // Text fallback — parse NZ formats, submit ISO via the hidden input.
 const iso=parseNzDate(text)
 return <span className="date-control">
  <input {...props} lang="en-NZ" placeholder="e.g. 11 Nov 2026" value={text}
   onChange={e=>{
    setText(e.target.value)
    // Report the parsed ISO to a controlled parent so its value stays ISO.
    if(onChange)onChange({...e,target:{...e.target,value:parseNzDate(e.target.value)??''}} as unknown as typeof e)
   }} type="text"/>
  <input type="hidden" name={name} value={iso??''}/>
  <small className="muted" aria-live="polite">{iso?caption(iso):'Enter a date like 11 Nov 2026'}</small>
 </span>
}
