'use client'
import {useEffect,useState} from 'react'
import {localityFromAddress} from '@shared/locality'

const proxy=process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/maps-proxy'

// Town / area suggestions for a public-area field, as a <datalist>. Uses the
// same NZ-only Places autocomplete as the address search, reduced to the town
// part of each result ("Waitoki Road, Waitoki" → "Waitoki"); never a street.
export function useTownSuggestions(query:string){
 const [towns,setTowns]=useState<string[]>([])
 useEffect(()=>{
  const text=query.trim()
  if(text.length<3)return
  const controller=new AbortController()
  const timer=setTimeout(async()=>{
   try{
    const response=await fetch(proxy+'/places-autocomplete',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({input:text}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])})
    if(!response.ok)return
    const {suggestions}=await response.json() as {suggestions?:{description?:string}[]}
    if(controller.signal.aborted)return
    setTowns([...new Set((suggestions||[]).map(s=>localityFromAddress(s.description)).filter(Boolean))].slice(0,6))
   }catch{/* suggestions are optional; typing still works */}
  },300)
  return ()=>{clearTimeout(timer);controller.abort()}
 },[query])
 return query.trim().length<3?[]:towns
}

// Visible buttons (like the address search) rather than a <datalist>, which
// some browsers never show. Hidden once the field matches a suggestion.
export function TownSuggestions({query,onPick}:{query:string;onPick:(town:string)=>void}){
 const towns=useTownSuggestions(query)
 if(!towns.length)return null
 // Typed in full: confirm the match instead of silently hiding the list.
 const match=towns.find(town=>town.toLowerCase()===query.trim().toLowerCase())
 if(match)return <small className="muted" role="status">✓ {match} found</small>
 return <ul aria-label="Town suggestions">{towns.map(town=><li key={town}><button type="button" className="lform-cancel" onClick={()=>onPick(town)}>{town}</button></li>)}</ul>
}
