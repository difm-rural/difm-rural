'use client'
import {useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import {MapPin,LocateFixed} from 'lucide-react'
import {NEARBY_RADII,type GuestLocation} from '@/lib/nearby'
import {chooseGuestLocation,chooseGuestRadius,forgetGuestLocation,findGuestTowns,chooseGuestTown} from '@/app/location-actions'

export function NearbyControls({location}:{location:GuestLocation}){
 const router=useRouter(),busyRef=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[town,setTown]=useState(''),[suggestions,setSuggestions]=useState<{id:string;label:string}[]>([])
 async function run(action:()=>Promise<{error:string}>,success:string){
  if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{const result=await action();if(result.error)setError(result.error);else{setNotice(success);router.refresh()}}catch{setError('Could not update your browsing location. Check your connection and try again.')}finally{busyRef.current=false;setBusy(false)}
 }
 function current(){void run(async()=>{
  if(!navigator.geolocation)return {error:'Location is unavailable in this browser. Choose a town instead.'}
  try{const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:15000,maximumAge:60000,enableHighAccuracy:false}));return await chooseGuestLocation(position.coords.latitude,position.coords.longitude,'Your current location')}
  catch{return {error:'Could not get your location. Allow location access in your browser settings, or choose a town instead.'}}
 },'Browsing location updated.')}
 async function searchTown(event:React.FormEvent){
  event.preventDefault();setSuggestions([])
  await run(async()=>{const result=await findGuestTowns(town);setSuggestions(result.suggestions);return {error:result.error || (!result.suggestions.length?'No matching towns found. Try a nearby town or suburb.':'')}},'Choose a result below to use that location.')
 }
 return <section className="nearby-controls" aria-label="Browsing location and distance">
  <div className="nearby-summary"><MapPin size={18} aria-hidden="true"/><strong>{location.radius===null?'All New Zealand':location.point?'Within '+location.radius+' km · '+location.label:'Near you · choose your location'}</strong><label>Distance<select aria-label="Distance from browsing location" value={location.radius ?? 'all'} disabled={busy} onChange={e=>void run(()=>chooseGuestRadius(e.target.value==='all'?null:Number(e.target.value)),'Distance updated.')}>{NEARBY_RADII.map(km=><option key={km} value={km}>Within {km} km</option>)}<option value="all">All New Zealand</option></select></label></div>
  {!location.point&&location.radius!==null&&<p>Choose your current location or a town to see nearby results. Until then, you&apos;re browsing all New Zealand.</p>}
  <div className="nearby-actions"><button type="button" disabled={busy} onClick={current}><LocateFixed size={16} aria-hidden="true"/>Use my location</button><details><summary>Choose a town</summary><form onSubmit={searchTown} className="nearby-town-search"><label htmlFor="nearby-town">Town or suburb in New Zealand</label><div><input id="nearby-town" value={town} maxLength={120} minLength={2} required disabled={busy} onChange={e=>{setTown(e.target.value);setSuggestions([])}} placeholder="e.g. Cambridge"/><button disabled={busy}>Find town</button></div></form>{suggestions.length>0&&<ul className="nearby-town-results">{suggestions.map(s=><li key={s.id}><button disabled={busy} type="button" onClick={()=>void run(async()=>{const result=await chooseGuestTown(s.id,s.label);if(!result.error)setSuggestions([]);return result},'Browsing location updated.')}>{s.label}</button></li>)}</ul>}</details>{location.point&&<button type="button" disabled={busy} onClick={()=>void run(()=>forgetGuestLocation(),'Browsing location cleared.')}>Clear location</button>}</div>
  {busy&&<p role="status">Updating location settings…</p>}{error&&<p className="nearby-error" role="alert">{error}</p>}{notice&&!busy&&<p role="status">{notice}</p>}
  <p className="nearby-privacy">Your approximate browsing location is remembered for six hours, without changing your profile. Distances are approximate; private or missing map pins are included under All New Zealand.</p>
 </section>
}
