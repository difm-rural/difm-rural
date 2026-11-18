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
type Query<T>={
 eq(column:string,value:string):Query<T>
 in(column:string,values:string[]):Query<T>
 order(column:string):Query<T>
 range(start:number,end:number):PromiseLike<{data:T[]|null;error:unknown}>
}
type RelationshipClient={
 from(table:'bids'):{select(columns:string):Query<{job_id:string}>}
 from(table:'jobs_public'):{select(columns:string):Query<RelationshipJob>}
}

export async function completedRelationshipJobs(client:unknown,requester:string,provider:string){
 // The web app installs its own SDK. Keep shared source independent of that
 // package and describe only the selected columns at this boundary.
 const db=client as RelationshipClient
 const bids=await allRows<{job_id:string}>(()=>db.from('bids').select('job_id')
  .eq('provider_id',provider).eq('status','accepted').order('job_id'))
 const ids=[...new Set(bids.map(bid=>bid.job_id))]
 const jobs:RelationshipJob[]=[]
 for(let i=0;i<ids.length;i+=200){
  jobs.push(...await allRows<RelationshipJob>(()=>db.from('jobs_public').select('id,title,created_at')
   .in('id',ids.slice(i,i+200)).eq('requester_id',requester).eq('status','completed').order('id')))
 }
 return jobs.sort((a,b)=>b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id))
}
