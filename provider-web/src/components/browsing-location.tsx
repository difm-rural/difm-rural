'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import {setBrowsingLocation} from '@/app/discovery-actions'
export function BrowsingLocation(){const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),router=useRouter()
 async function handleProfile(){setBusy(true);try{await setBrowsingLocation(null,null);setMessage('Using your private profile location.');router.refresh()}catch{setMessage('Could not change location. Try again.')}finally{setBusy(false)}}
 function handleCurrent(){if(!navigator.geolocation){setMessage('Location is unavailable. Add a private GPS location in Account → Profile.');return}setBusy(true);setMessage('');navigator.geolocation.getCurrentPosition(async position=>{try{const result=await setBrowsingLocation(position.coords.latitude,position.coords.longitude);setMessage(result.error || 'Browsing location updated for six hours. Your profile has not changed.');if(!result.error)router.refresh()}catch{setMessage('Could not save this browsing location. Try again.')}finally{setBusy(false)}},()=>{setBusy(false);setMessage('Could not read your location. Allow browser location access or use your profile location.')},{timeout:15000,enableHighAccuracy:false,maximumAge:60000})}
 return <div><div className="lform-actions"><button type="button" className="lform-cancel" disabled={busy} onClick={handleCurrent}>{busy?'Working…':'Use current location'}</button><button type="button" className="lform-cancel" disabled={busy} onClick={()=>void handleProfile()}>Use profile location</button></div>{message&&<p role="status" className="muted">{message}</p>}</div>
}
