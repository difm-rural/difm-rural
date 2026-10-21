import {CATEGORIES} from '@shared/categories'
import type {SupabaseClient} from '@supabase/supabase-js'
export const JOB_COLUMNS='id,title,description,category,price_type,price,location_area,photos,created_at,schedule_type,scheduled_date,date_from,date_to,materials_type,access_conditions,hide_exact_location'
export const LISTING_COLUMNS='id,provider_id,title,description,category,kind,pricing_type,rate,unit_label,location_name,photos,created_at,card_headline,card_supporting_text,card_style,min_charge,minimum_units,max_units,pricing_variants,pricing_add_ons,pricing_terms,materials,payment_timing,travel_range_km,availability'
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function browseFilters(values:Record<string,unknown>){
 const page=Number(values.page)
 return {q:typeof values.q==='string'?values.q.trim().slice(0,120):'',category:CATEGORIES.includes(String(values.category))?String(values.category):'',kind:['service','grazing','hire','lease','for_sale'].includes(String(values.kind))?String(values.kind):'',page:Number.isInteger(page)&&page>0?Math.min(page,100000):1}
}
export function browseHref(path:string,f:ReturnType<typeof browseFilters>){const q=new URLSearchParams();if(f.q)q.set('q',f.q);if(f.category)q.set('category',f.category);if(f.kind)q.set('kind',f.kind);if(f.page>1)q.set('page',String(f.page));return path+(q.size?'?'+q:'')}
export function publicJobsQuery(client:SupabaseClient){return client.from('jobs_public').select(JOB_COLUMNS).eq('status','open').eq('visibility','public')}
export function publicListingsQuery(client:SupabaseClient){return client.from('services').select(LISTING_COLUMNS).eq('is_active',true).is('closed_at',null)}
export function publicQuery(client:SupabaseClient,kind:'jobs'|'listings'){return kind==='jobs'?publicJobsQuery(client):publicListingsQuery(client)}
export type PublicRow={id:string;title:string;description:string|null;category:string|null;kind?:string;photos:string[]|null;location_area?:string|null;location_name?:string|null;price_type?:string;price?:number|null;pricing_type?:string;rate?:number|null;unit_label?:string|null}
export async function publicRows(client:SupabaseClient,kind:'jobs'|'listings'){
 const rows:PublicRow[]=[]
 for(let offset=0;;offset+=500){const {data,error}=await publicQuery(client,kind).order('created_at',{ascending:false}).order('id').range(offset,offset+499);if(error)throw error;rows.push(...(data as unknown as PublicRow[] || []));if(!data || data.length<500)break}
 return rows
}
type SearchRow={title?:string;description?:string|null;category?:string|null;kind?:string|null;location_area?:string|null;location_name?:string|null}
export function publicResults<T extends SearchRow>(rows:T[],f:ReturnType<typeof browseFilters>){
 const query=f.q.toLocaleLowerCase('en-NZ'),filtered=rows.filter(r=>(!f.category||r.category===f.category)&&(!f.kind||r.kind===f.kind)&&(!query||[r.title,r.description,r.category,r.location_area,r.location_name].filter(Boolean).join(' ').toLocaleLowerCase('en-NZ').includes(query)))
 const pages=Math.max(1,Math.ceil(filtered.length/18)),page=Math.min(f.page,pages)
 return {rows:filtered.slice((page-1)*18,page*18),count:filtered.length,pages,page}
}
