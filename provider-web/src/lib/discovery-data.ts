import {resolvePublicJobLocations} from './job-discovery'
import type {SupabaseClient} from '@supabase/supabase-js'
import {coordinates,type Coordinates} from './discovery'
export async function allRows<T>(makeQuery:()=>{range:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:unknown}>}):Promise<T[]>{
 const rows:T[]=[]
 for(let start=0;;start+=500){const {data,error}=await makeQuery().range(start,start+499);if(error)throw error;rows.push(...(data || []));if(!data||data.length<500)return rows}
}
export type DiscoveryJob={photos?:string[]|null;id:string;title:string;description:string|null;category:string|null;location_name:string|null;location_area:string|null;latitude:number|null;longitude:number|null;created_at:string;price_type:string;price:number|null;status:string;requester_id:string}
export type DiscoveryListing={id:string;title:string;description:string|null;category:string|null;kind:string|null;location_name:string|null;latitude:number|null;longitude:number|null;created_at:string;pricing_type:string;rate:number|null;unit_label:string|null;photos:string[]|null;card_headline:string|null;card_supporting_text:string|null;card_style:'bold'|'bottom'|'clean'|null}
export async function loadDiscoveryJobs(client:SupabaseClient){return resolvePublicJobLocations(await allRows<DiscoveryJob>(()=>client.from('jobs_public').select('id,title,description,category,location_name,location_area,latitude,longitude,created_at,price_type,price,status,requester_id,photos').eq('status','open').eq('visibility','public').order('created_at',{ascending:false}).order('id')))}
export async function loadDiscoveryListings(client:SupabaseClient){return allRows<DiscoveryListing>(()=>client.from('services').select('id,title,description,category,kind,location_name,latitude,longitude,created_at,pricing_type,rate,unit_label,photos,card_headline,card_supporting_text,card_style').eq('is_active',true).is('closed_at',null).order('created_at',{ascending:false}).order('id'))}
export async function watchedJobs(client:SupabaseClient,userId:string){return allRows<{job_id:string}>(()=>client.from('watchlist').select('job_id').eq('user_id',userId).order('job_id'))}
export async function privateOrigin(client:SupabaseClient,userId:string):Promise<Coordinates|null>{const {data,error}=await client.from('profiles').select('latitude,longitude').eq('id',userId).maybeSingle();if(error)throw error;return coordinates(data?.latitude,data?.longitude)}
export async function ownedInterest(client:SupabaseClient,userId:string,id:string){const {data,error}=await client.from('saved_interests').select('*').eq('id',id).eq('user_id',userId).maybeSingle();if(error)throw error;return data}
