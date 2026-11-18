import type {SupabaseClient} from '@supabase/supabase-js'

export type RelationshipSide='locals'|'customers'
export const relationshipLabels={locals:'My Locals',customers:'My Customers'} as const
export const relationshipSide=(value:unknown):RelationshipSide=>value==='customers'?'customers':'locals'
export const relationshipColumn=(side:RelationshipSide)=>side==='customers'?'provider_id':'requester_id'
export const relationshipPair=(viewer:string,other:string,side:RelationshipSide)=>
 side==='customers'?{requester:other,provider:viewer}:{requester:viewer,provider:other}

export async function allRows<T>(makeQuery:()=>{range:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:unknown}>}):Promise<T[]>{
 const rows:T[]=[]
 for(let start=0;;start+=500){
  const {data,error}=await makeQuery().range(start,start+499)
  if(error)throw error
  rows.push(...(data??[]))
  if(!data||data.length<500)return rows
 }
}

export type RelationshipJob={id:string;title:string;created_at:string}
export async function completedRelationshipJobs(client:SupabaseClient,requester:string,provider:string){
 const bids=await allRows<{job_id:string}>(()=>client.from('bids').select('job_id')
  .eq('provider_id',provider).eq('status','accepted').order('job_id'))
 const ids=[...new Set(bids.map(bid=>bid.job_id))]
 const jobs:RelationshipJob[]=[]
 for(let i=0;i<ids.length;i+=200){
  jobs.push(...await allRows<RelationshipJob>(()=>client.from('jobs_public').select('id,title,created_at')
   .in('id',ids.slice(i,i+200)).eq('requester_id',requester).eq('status','completed').order('id')))
 }
 return jobs.sort((a,b)=>b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id))
}
