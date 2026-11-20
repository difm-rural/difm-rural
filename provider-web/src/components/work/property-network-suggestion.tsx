'use client'

import {useEffect,useRef,useState} from 'react'
import {UsersRound} from 'lucide-react'
import Link from '@/components/navigation-link'
import {createClient} from '@/lib/supabase/client'
import {
 acceptPropertySuggestion,dismissPropertySuggestion,loadPropertySuggestionState,propertySuggestion,propertySuggestionText,
 type PropertySuggestion,
} from '@shared/propertyNetwork'

// After completed work (and its review), offer the requester one tap to add the
// provider to their property network for the matching area. Renders nothing
// when nothing maps, they are already linked there, or the member said "Not now".
export function PropertyNetworkSuggestion({owner,providerId,providerName,category,kind,title}:{
 owner:string;providerId:string;providerName:string|null;category:string|null|undefined;kind?:string|null;title?:string|null
}){
 const [client]=useState(createClient)
 const [suggestion,setSuggestion]=useState<PropertySuggestion|null>(null)
 const [state,setState]=useState<'idle'|'busy'|'added'|'dismissed'|'error'>('idle')
 const lock=useRef(false)
 useEffect(()=>{
  let active=true
  if(providerId===owner)return
  loadPropertySuggestionState(client,owner)
   .then(({network,dismissals})=>{if(active)setSuggestion(propertySuggestion(network,dismissals,{category,kind,title,providerId}))})
   .catch(()=>{/* the offer is optional; stay quiet */})
  return ()=>{active=false}
 },[client,owner,providerId,category,kind,title])

 async function respond(accept:boolean){
  if(lock.current||!suggestion)return
  lock.current=true;setState('busy')
  try{
   if(accept)await acceptPropertySuggestion(client,suggestion)
   else await dismissPropertySuggestion(client,owner,suggestion)
   setState(accept?'added':'dismissed')
  }catch{setState('error')}
  finally{lock.current=false}
 }

 if(!suggestion||state==='dismissed')return null
 const name=providerName||'this provider'
 if(state==='added')return <section className="card property-suggestion" role="status">
  <p><strong>{name} is in your property network for {suggestion.areaLabel}.</strong></p>
  <Link href={'/property-network?area='+suggestion.area} className="card-link">Open My Property Network</Link>
 </section>
 return <section className="card property-suggestion" aria-labelledby="property-suggestion-heading">
  <h2 id="property-suggestion-heading"><UsersRound size={20} aria-hidden="true"/> {propertySuggestionText(name,suggestion)}</h2>
  <p className="muted">They&apos;ll be listed for {suggestion.name.toLowerCase()} so you can find them again.</p>
  {state==='error'&&<p role="alert">Could not save. Try again.</p>}
  <div className="lform-actions">
   <button type="button" className="lform-save" disabled={state==='busy'} onClick={()=>void respond(true)}>Add {name.split(' ')[0]}</button>
   <button type="button" className="lform-cancel" disabled={state==='busy'} onClick={()=>void respond(false)}>Not now</button>
  </div>
 </section>
}
