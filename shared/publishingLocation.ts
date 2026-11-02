// Advisory only: distant properties and service areas can be legitimate.
export const PUBLISHING_DISTANCE_WARNING_KM = 200
export type PublishingLocation={latitude?:unknown;longitude?:unknown;area?:string|null;kind:'job'|'listing'}
type Point={latitude:number;longitude:number}
type Profile={latitude?:unknown;longitude?:unknown;region?:string|null}
function point(lat:unknown,lng:unknown):Point|null{
  if(![lat,lng].every(v=>(typeof v==='number'||typeof v==='string')&&String(v).trim()!==''))return null
  const latitude=Number(lat),longitude=Number(lng)
  return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{latitude,longitude}:null
}
function distance(a:Point,b:Point){
  const r=Math.PI/180,x=(b.latitude-a.latitude)*r,y=(b.longitude-a.longitude)*r
  const h=Math.sin(x/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(y/2)**2
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)))
}
export async function publishingLocationWarning(location:PublishingLocation,profile:Profile|null,resolve:(area:string)=>Promise<Point|null>){
  if(!profile)return null
  const origin=point(profile.latitude,profile.longitude)||(profile.region?.trim()?await resolve(profile.region):null)
  if(!origin)return null
  const destination=point(location.latitude,location.longitude)||(location.area?.trim()?await resolve(location.area):null)
  if(!destination)return null
  const km=distance(origin,destination)
  if(km<=PUBLISHING_DISTANCE_WARNING_KM)return null
  const distanceKm=Math.round(km)
  return {distanceKm,message:`This ${location.kind} is about ${distanceKm} km from your saved profile location${profile.region?' ('+profile.region+')':''}. Is this the correct location? People searching near your saved location may not find it.`}
}
