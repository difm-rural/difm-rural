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

export function TownSuggestions({id,query}:{id:string;query:string}){
 const towns=useTownSuggestions(query)
 return <datalist id={id}>{towns.map(town=><option key={town} value={town}/>)}</datalist>
}
