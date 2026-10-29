import {CATEGORIES} from '@shared/categories'
export type Coordinates={latitude:number;longitude:number}
export type DiscoveryFilters={q:string;category:string;kind:string;sort:'newest'|'nearest';radius:number|null;page:number;interest:string}
export const RADII=[10,25,50,100,200]
export function coordinates(lat:unknown,lng:unknown):Coordinates|null{
 if(lat==null||lng==null||lat===''||lng==='')return null
 const latitude=Number(lat),longitude=Number(lng)
 return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{latitude,longitude}:null
}
export function discoveryFilters(values:Record<string,unknown>):DiscoveryFilters{
 const radius=Number(values.radius),page=Number(values.page)
 return {q:typeof values.q==='string'?values.q.trim().slice(0,120):'',category:CATEGORIES.includes(String(values.category))?String(values.category):'',kind:['service','grazing','hire','lease','for_sale'].includes(String(values.kind))?String(values.kind):'',sort:values.sort==='nearest'?'nearest':'newest',radius:Number.isInteger(radius)&&radius>=1&&radius<=200?radius:null,page:Number.isInteger(page)&&page>0?Math.min(page,100000):1,interest:typeof values.interest==='string'&&/^[a-f0-9-]{36}$/i.test(values.interest)?values.interest:''}
}
export function discoveryHref(path:string,f:Partial<DiscoveryFilters>){const params=new URLSearchParams();for(const [k,v] of Object.entries(f))if(v!==null&&v!==''&&v!==undefined&&!(k==='page'&&v===1))params.set(k,String(v));return path+(params.size?'?'+params:'')}
export function distanceKm(a:Coordinates,b:Coordinates){const r=Math.PI/180,dlat=(b.latitude-a.latitude)*r,dlng=(b.longitude-a.longitude)*r,h=Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlng/2)**2;return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)))}
export type Discoverable={id:string;title:string;description?:string|null;category?:string|null;kind?:string|null;location_name?:string|null;location_area?:string|null;latitude?:number|null;longitude?:number|null;created_at:string;discovery_latitude?:number;discovery_longitude?:number;discovery_location_approximate?:boolean}
export function discover<T extends Discoverable>(rows:T[],f:DiscoveryFilters,origin:Coordinates|null){
 const query=f.q.toLocaleLowerCase('en-NZ')
 const matching=rows.filter(row=>(!f.category||row.category===f.category)&&(!f.kind||row.kind===f.kind)&&(!query||[row.title,row.description,row.category,row.location_name,row.location_area].some(v=>String(v || '').toLocaleLowerCase('en-NZ').includes(query)))).map(row=>{const pin=coordinates(row.latitude,row.longitude)||coordinates(row.discovery_latitude,row.discovery_longitude);return {...row,distance:origin&&pin?distanceKm(origin,pin):null}}).filter(row=>!f.radius||(row.distance!==null&&row.distance<=f.radius))
 matching.sort((a,b)=>f.sort==='nearest'&&origin?(a.distance ?? Infinity)-(b.distance ?? Infinity)||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id):b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id))
 const pages=Math.max(1,Math.ceil(matching.length/20)),page=Math.min(f.page,pages)
 return {rows:matching.slice((page-1)*20,page*20),count:matching.length,pages,page}
}
export function savedSearchInput(data:FormData,origin:Coordinates|null){
 const value=(key:string)=>String(data.get(key) || '').trim(),f=discoveryFilters({q:value('q'),category:value('category'),radius:value('radius')}),name=value('name'),frequency=value('frequency')
 if(!name||name.length>100||!['off','daily','instant'].includes(frequency))return {ok:false as const,error:'Add a name up to 100 characters and choose an alert frequency.'}
 if(value('radius')&&!f.radius)return {ok:false as const,error:'Choose a valid distance.'}
 if(value('category')&&!f.category)return {ok:false as const,error:'Choose a category from the list.'}
 if(f.radius&&!origin)return {ok:false as const,error:'Choose a browsing location before saving a distance search.'}
 const point=f.radius?origin:null
 const filter_key=JSON.stringify({kind:'saved_search',query:f.q.toLowerCase(),category:f.category,latitude:point?Number(point.latitude).toFixed(4):null,longitude:point?Number(point.longitude).toFixed(4):null,radius_km:f.radius})
 return {ok:true as const,value:{kind:'saved_search',name,filter_key,query:f.q||null,category:f.category||null,latitude:point?.latitude ?? null,longitude:point?.longitude ?? null,radius_km:f.radius,location_name:f.radius?value('location_name').slice(0,120)||'Saved browsing location':null,frequency,push_enabled:frequency!=='off'&&data.get('push_enabled')==='on',email_enabled:frequency!=='off'&&data.get('email_enabled')==='on',active:true,auto_paused_at:null,last_engaged_at:new Date().toISOString()}}
}
