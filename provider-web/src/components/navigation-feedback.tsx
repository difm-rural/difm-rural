'use client'
import {createContext,Suspense,useCallback,useContext,useEffect,useRef,useState} from 'react'
import {usePathname,useSearchParams} from 'next/navigation'
import {navigationTarget} from '@shared/navigationTarget'
type Pending={href:string;from:string;started:number}
type Feedback={pending:Pending|null;slow:boolean;begin:(href:unknown)=>void;settle:(url?:string)=>void}
const Context=createContext<Feedback>({pending:null,slow:false,begin:()=>{},settle:()=>{}})
export const useNavigationFeedback=()=>useContext(Context)
function CommitObserver({settle}:{settle:(url?:string)=>void}){
 const pathname=usePathname(),search=useSearchParams()
 useEffect(()=>{settle(pathname+(search.size?'?'+search.toString():''))},[pathname,search,settle])
 return null
}
export function NavigationFeedback({children}:{children:React.ReactNode}){
 const [pending,setPending]=useState<Pending|null>(null),[slow,setSlow]=useState(false)
 const committed=useRef<string|null>(null)
 const begin=useCallback((href:unknown)=>{
  const target=navigationTarget(href,window.location.href)
  if(!target)return
  setSlow(false);setPending({href:target,from:window.location.pathname+window.location.search,started:Date.now()})
 },[])
 const settle=useCallback((url?:string)=>{if(url)committed.current=url;setPending(current=>!url||current&&(url===current.href||url!==current.from)?null:current)},[])
 useEffect(()=>{
  if(!pending)return
  const timer=setTimeout(()=>setSlow(true),10000)
  return ()=>clearTimeout(timer)
 },[pending])
 useEffect(()=>{
  const backOrForward=()=>{
   const href=window.location.pathname+window.location.search
   if(href===committed.current)return
   setSlow(false);setPending({href,from:committed.current||'',started:Date.now()})
  }
  window.addEventListener('popstate',backOrForward)
  return ()=>window.removeEventListener('popstate',backOrForward)
 },[])
 return <Context.Provider value={{pending,slow,begin,settle}}><Suspense fallback={null}><CommitObserver settle={settle}/></Suspense>{children}{pending&&<div className="navigation-progress" role="progressbar" aria-label="Loading page"/>}</Context.Provider>
}
