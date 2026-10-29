// Discovery may use a public town centre, never a job's hidden address or pin.
export type AreaPoint={latitude:number;longitude:number}
type JobArea={latitude?:unknown;longitude?:unknown;location_area?:string|null}
function pin(latitude:unknown,longitude:unknown):AreaPoint|null{
  if(![latitude,longitude].every(v=>(typeof v==='number'||typeof v==='string')&&String(v).trim()!==''))return null
  const lat=Number(latitude),lng=Number(longitude)
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{latitude:lat,longitude:lng}:null
}
export function createPublicAreaCache(lookup:(area:string)=>Promise<AreaPoint|null>,now=Date.now){
  const cache=new Map<string,{point:AreaPoint|null;expires:number}>(),pending=new Map<string,Promise<AreaPoint|null>>()
  return async(area:string)=>{
    const name=area.trim().replace(/^(near|around)\s+/i,'').slice(0,160),key=name.toLowerCase()
    if(!key)return null
    const saved=cache.get(key);if(saved&&saved.expires>now())return saved.point
    if(pending.has(key))return pending.get(key)!
    const task=Promise.resolve().then(()=>lookup(name)).then(result=>{
      const point=pin(result?.latitude,result?.longitude)
      if(cache.size>=256)cache.delete(cache.keys().next().value!)
      cache.set(key,{point,expires:now()+(point?24*3600000:60000)})
      return point
    }).catch(()=>null).finally(()=>pending.delete(key))
    pending.set(key,task);return task
  }
}
export async function lookupPublicArea(proxy:string,area:string,request:typeof fetch=fetch):Promise<AreaPoint|null>{
  async function json(route:string,options?:RequestInit){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000)
    try{const response=await request(proxy+route,{...options,signal:controller.signal});if(!response.ok)throw new Error('Public area lookup unavailable');return await response.json()}finally{clearTimeout(timer)}
  }
  const input=/new zealand/i.test(area)?area:area+', New Zealand'
  const result=await json('/places-autocomplete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input})})
  const id=result.suggestions?.[0]?.place_id
  if(typeof id!=='string'||!id)return null
  const detail=await json('/place-details?place_id='+encodeURIComponent(id))
  return pin(detail.latitude,detail.longitude)
}
export async function addPublicJobAreas<T extends JobArea>(jobs:T[],resolve:(area:string)=>Promise<AreaPoint|null>){
  const output:(T&{discovery_latitude?:number;discovery_longitude?:number;discovery_location_approximate?:boolean})[]=[...jobs]
  let cursor=0
  async function worker(){
    while(cursor<jobs.length){const index=cursor++,job=jobs[index]
      if(pin(job.latitude,job.longitude)||!job.location_area?.trim())continue
      try{const centre=await resolve(job.location_area);if(centre)output[index]={...job,discovery_latitude:centre.latitude,discovery_longitude:centre.longitude,discovery_location_approximate:true}}catch{/* Keep an unavailable area unlocated; nationwide browsing still includes it. */}
    }
  }
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},worker))
  return output
}
