'use server'
import {cookies} from 'next/headers'
import {guestLocation,LOCATION_COOKIE} from '@/lib/guest-location'
import {NEARBY_RADII,point} from '@/lib/nearby'

async function store(value:{point:{latitude:number;longitude:number}|null;label:string;radius:number|null}){
  (await cookies()).set(LOCATION_COOKIE,JSON.stringify({latitude:value.point?.latitude ?? null,longitude:value.point?.longitude ?? null,label:value.label,radius:value.radius,expires:Date.now()+6*3600000}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:6*3600})
}
export async function chooseGuestLocation(latitude:number,longitude:number,label:string){
  const p=point(latitude,longitude);if(!p)return {error:'That location could not be used. Please choose it again.'}
  try{const current=await guestLocation();await store({point:{latitude:Number(p.latitude.toFixed(2)),longitude:Number(p.longitude.toFixed(2))},label:String(label || 'Current location').slice(0,120),radius:current.radius ?? 50});return {error:''}}
  catch{return {error:'Could not remember your browsing location. Please try again.'}}
}
export async function chooseGuestRadius(radius:number|null){
  if(radius!==null&&!NEARBY_RADII.includes(radius))return {error:'Choose a distance from the available options.'}
  try{await store({...await guestLocation(),radius});return {error:''}}catch{return {error:'Could not change the distance. Please try again.'}}
}
export async function forgetGuestLocation(){try{(await cookies()).delete(LOCATION_COOKIE);return {error:''}}catch{return {error:'Could not clear the location. Please try again.'}}}
function proxyUrl(){const base=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!base)throw new Error('Unavailable');return base+'/functions/v1/maps-proxy'}
export async function findGuestTowns(input:string):Promise<{error:string;suggestions:{id:string;label:string}[]}>{
  const query=String(input).trim();if(query.length<2||query.length>120)return {error:'Enter a town or suburb to search.',suggestions:[]}
  try{const response=await fetch(proxyUrl()+'/places-autocomplete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:query}),cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Unavailable');const data=await response.json();return {error:'',suggestions:(data.suggestions || []).slice(0,5).map((p:{place_id:string;description:string})=>({id:p.place_id,label:p.description}))}}
  catch{return {error:'Could not find towns. Check your connection and try again, or use your current location.',suggestions:[]}}
}
export async function chooseGuestTown(id:string,label:string){
  if(!/^[A-Za-z0-9_-]{1,300}$/.test(id))return {error:'Search for the town again and choose a result.'}
  try{const response=await fetch(proxyUrl()+'/place-details?place_id='+encodeURIComponent(id),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Unavailable');const data=await response.json();return await chooseGuestLocation(data.latitude,data.longitude,label)}catch{return {error:'Could not load that town. Choose it again or use your current location.'}}
}
