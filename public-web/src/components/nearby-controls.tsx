'use client'
import {useId,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import {MapPin,LocateFixed} from 'lucide-react'
import {NEARBY_RADII,type GuestLocation} from '@/lib/nearby'
import {chooseGuestLocation,chooseGuestRadius,forgetGuestLocation,findGuestTowns,chooseGuestTown} from '@/app/location-actions'

export function NearbyControls({location}:{location:GuestLocation}){
 const panelId=useId(),[expanded,setExpanded]=useState(false)
 const router=useRouter(),busyRef=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[town,setTown]=useState(''),[suggestions,setSuggestions]=useState<{id:string;label:string}[]>([])
 async function run(action:()=>Promise<{error:string}>,success:string,closeOnSuccess=false){
  if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{const result=await action();if(result.error){setError(result.error);setExpanded(true)}else{setNotice(success);if(closeOnSuccess)setExpanded(false);router.refresh()}}catch{setError('Could not update your browsing location. Check your connection and try again.');setExpanded(true)}finally{busyRef.current=false;setBusy(false)}
 }
 function current(){void run(async()=>{
  if(!navigator.geolocation)return {error:'Location is unavailable in this browser. Choose a town instead.'}
  try{const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:15000,maximumAge:60000,enableHighAccuracy:false}));return await chooseGuestLocation(position.coords.latitude,position.coords.longitude,'Your current location')}
  catch{return {error:'Could not get your location. Allow location access in your browser settings, or choose a town instead.'}}
 },'Browsing location updated.',true)}
 async function searchTown(event:React.FormEvent){
  event.preventDefault();setSuggestions([])
  await run(async()=>{const result=await findGuestTowns(town);setSuggestions(result.suggestions);return {error:result.error || (!result.suggestions.length?'No matching towns found. Try a nearby town or suburb.':'')}},'Choose a result below to use that location.')
 }
 return <section className="nearby-controls nearby-compact" aria-label="Browsing location and distance">
  <div className="nearby-summary"><MapPin size={17} aria-hidden="true"/><strong title={location.label}>{location.radius===null?'All New Zealand':location.point?location.label:'Near you'}</strong><label><span className="guest-sr-only">Distance</span><select aria-label="Distance from browsing location" value={location.radius ?? 'all'} disabled={busy} onChange={e=>void run(()=>chooseGuestRadius(e.target.value==='all'?null:Number(e.target.value)),'Distance updated.')}>{NEARBY_RADII.map(km=><option key={km} value={km}>Within {km} km</option>)}<option value="all">All New Zealand</option></select></label><button type="button" className="nearby-change" disabled={busy} aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(!expanded)}>{busy?'Updating…':expanded?'Done':'Change'}</button></div>
  {!location.point&&location.radius!==null&&<p className="nearby-fallback">Choose a location to see nearby results. Showing all New Zealand for now.</p>}
  {expanded&&<div id={panelId} className="nearby-panel">
    <div className="nearby-actions"><button type="button" disabled={busy} onClick={current}><LocateFixed size={16} aria-hidden="true"/>Use my location</button>{location.point&&<button type="button" disabled={busy} onClick={()=>void run(()=>forgetGuestLocation(),'Browsing location cleared.',true)}>Clear location</button>}</div>
    <form onSubmit={searchTown} className="nearby-town-search"><label htmlFor={panelId+'-town'}>Or choose a town or suburb</label><div><input id={panelId+'-town'} value={town} maxLength={120} minLength={2} required disabled={busy} onChange={e=>{setTown(e.target.value);setSuggestions([])}} placeholder="e.g. Cambridge"/><button disabled={busy}>Find town</button></div></form>
    {suggestions.length>0&&<ul className="nearby-town-results">{suggestions.map(s=><li key={s.id}><button disabled={busy} type="button" onClick={()=>void run(async()=>{const result=await chooseGuestTown(s.id,s.label);if(!result.error)setSuggestions([]);return result},'Browsing location updated.',true)}>{s.label}</button></li>)}</ul>}
    <p className="nearby-privacy">Remembered for six hours without changing your profile. Distances use public map pins or town centres; exact private job locations stay hidden. Use All New Zealand to include items without a usable public location.</p>
  </div>}
  {error&&<p className="nearby-error" role="alert">{error}</p>}
  <p className="guest-sr-only" role="status">{busy?'Updating location settings…':notice}</p>
 </section>
}
