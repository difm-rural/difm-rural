import { allRows } from './relationshipHistory'
import { ACTIVE_JOB_INVITATIONS } from './jobInvitations'

export const PROVIDER_SHARE_MESSAGE='Found this local provider on Rural Connections. Thought they might be useful for you.'
export const providerProfileUrl=(id:string)=>'https://dev.ruralconnections.nz/people/'+encodeURIComponent(id)

export type SavedProvider={id:string;full_name:string|null;display_name:string|null;avatar_url:string|null;region:string|null;skills:string[]|null;services?:string[]}
type Service={provider_id:string;category:string|null}
type Row = Service| {provider_id:string}|SavedProvider|{id:string;title:string}|{job_id:string;provider_id:string;status:string;revision:number}
type Query<T> = {
 eq(column:string,value:string|boolean):Query<T>
 is(column:string,value:null):Query<T>
 in(column:string,values:string[]):Query<T>
 order(column:string,options?:{ascending:boolean}):Query<T>
 range(start:number,end:number):PromiseLike<{data:T[]|null;error:unknown}>
}
type Client={
 from(table:string):{
  select<T extends Row>(columns:string):Query<T>
  insert(row:{requester_id:string;provider_id:string}):PromiseLike<{error:{code?:string}|null}>
  delete():{eq(key:string,value:string):{eq(key:string,value:string):PromiseLike<{error:unknown}>}}
 }
}

// My People: one entry per provider, however they are related. Saved providers
// keep their saved order; providers only worked with follow, most recent first.
export type WorkHistory={personId:string;person:SavedProvider|null;times_worked?:number|null;jobs_count?:number|null;
 bookings_count?:number|null;last_engaged_at?:string|null;categories?:string[]|null}
export type MyPerson={id:string;person:SavedProvider;saved:boolean;work:WorkHistory|null}
export function mergeMyPeople(saved:readonly SavedProvider[],worked:readonly WorkHistory[]):MyPerson[]{
 const work=new Map<string,WorkHistory>()
 for(const row of worked)if(row.personId&&!work.has(row.personId))work.set(row.personId,row)
 const people:MyPerson[]=[],seen=new Set<string>()
 for(const person of saved){
  if(seen.has(person.id))continue
  seen.add(person.id)
  const history=work.get(person.id)??null
  people.push({id:person.id,person:{...history?.person,...person,services:person.services},saved:true,work:history})
 }
 for(const row of work.values()){
  if(seen.has(row.personId)||!row.person)continue
  seen.add(row.personId)
  people.push({id:row.personId,person:row.person,saved:false,work:row})
 }
 return people
}
// "2 jobs and 1 booking completed" — the counts behind "worked together".
export function completedWorkLabel(work:Pick<WorkHistory,'jobs_count'|'bookings_count'|'times_worked'>|null){
 if(!work)return ''
 const jobs=work.jobs_count??0,bookings=work.bookings_count??0
 const part=(n:number,word:string)=>n+' '+word+(n===1?'':'s')
 const parts=[jobs?part(jobs,'job'):'',bookings?part(bookings,'booking'):''].filter(Boolean)
 if(!parts.length){const n=work.times_worked??0;return n?part(n,'job')+' completed':''}
 return parts.join(' and ')+' completed'
}

// What each provider advertises: the categories of their active listings, the
// one they list most first, at most four. Used for every provider on My People.
export async function loadAdvertisedServices(client:unknown,ids:readonly string[]){
 const db=client as Client, result=new Map<string,string[]>()
 for(let i=0;i<ids.length;i+=200){
  const batch=ids.slice(i,i+200)
  if(!batch.length)continue
  const listings=await allRows(()=>db.from('services').select<Service>('provider_id,category').in('provider_id',batch).eq('is_active',true).is('closed_at',null).order('id'))
  const counts=new Map<string,Map<string,number>>()
  for(const listing of listings){
   if(!listing.category)continue
   const mine=counts.get(listing.provider_id)??new Map<string,number>()
   mine.set(listing.category,(mine.get(listing.category)??0)+1)
   counts.set(listing.provider_id,mine)
  }
  for(const [id,mine] of counts)result.set(id,[...mine].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([category])=>category))
 }
 return result
}

export async function loadSavedProviders(client:unknown,userId:string){
 const db=client as Client
 const saves=await allRows(()=>db.from('saved_providers').select<{provider_id:string}>('provider_id')
  .eq('requester_id',userId).order('created_at',{ascending:false}).order('provider_id'))
 const people=new Map<string,SavedProvider>()
 for(let i=0;i<saves.length;i+=200){
  const batch=saves.slice(i,i+200).map(row=>row.provider_id)
  const [rows,services]=await Promise.all([
   allRows(()=>db.from('profiles_public').select<SavedProvider>('id,full_name,display_name,avatar_url,region,skills').in('id',batch).order('id')),
   loadAdvertisedServices(db,batch),
  ])
  for(const person of rows)people.set(person.id,{...person,services:services.get(person.id)})
 }
 return saves.flatMap(row=>people.get(row.provider_id) ?? [])
}

// A short summary for a card: the first few items, then how many more
// ("Fencing · Water +2 more"). Duplicates and blanks are dropped.
export function shortList(items:readonly (string|null|undefined)[]|null|undefined,max=2){
 const unique=[...new Set((items??[]).map(item=>String(item??'').trim()).filter(Boolean))]
 return unique.slice(0,max).join(' · ')+(unique.length>max?' +'+(unique.length-max)+' more':'')
}
// Cards show what the provider advertises, not their full skills list (which can
// run to dozens of capabilities and read as "+58 more").
export const providerServiceSummary=(person:Pick<SavedProvider,'services'>)=>shortList(person.services??[])
export const providerServices=(person:SavedProvider)=>(person.services ?? person.skills ?? []).slice(0,4).join(' · ')

export async function setProviderSaved(client:unknown,requester:string,provider:string,saved:boolean){
 const table=(client as Client).from('saved_providers')
 if(saved){
  const {error}=await table.insert({requester_id:requester,provider_id:provider})
  if(error && error.code!=='23505')throw error
 }else{
  const {error}=await table.delete().eq('requester_id',requester).eq('provider_id',provider)
  if(error)throw error
 }
}

export type InviteJob={id:string;title:string}
export type KnownInvitation={job_id:string;provider_id:string;status:string;revision:number}

export async function loadInviteChoices(client:unknown,userId:string){
 const db=client as Client
 const [jobs,invites]=await Promise.all([
  allRows(()=>db.from('jobs').select<InviteJob>('id,title').eq('requester_id',userId).eq('status','open')
   .order('created_at',{ascending:false}).order('id')),
  allRows(()=>db.from('job_invites').select<KnownInvitation>('job_id,provider_id,status,revision')
   .eq('requester_id',userId).order('job_id').order('provider_id')),
 ])
 return {jobs,invites}
}

export function providerInviteJobs(jobs:InviteJob[],invites:KnownInvitation[],providerId:string){
 const byJob=new Map(invites.filter(invite=>invite.provider_id===providerId).map(invite=>[invite.job_id,invite]))
 return jobs.flatMap(job=>{
  const invite=byJob.get(job.id)
  return invite&&ACTIVE_JOB_INVITATIONS.includes(invite.status)?[]:[{...job,revision:invite?.revision}]
 })
}

export async function shareProviderLink(share:((data:{text:string;url:string})=>Promise<void>)|undefined,copy:((url:string)=>Promise<void>)|undefined,url:string){
 if(share){
  try{await share({text:PROVIDER_SHARE_MESSAGE,url});return 'shared'}
  catch(error){if(error instanceof Error&&error.name==='AbortError')return 'cancelled'}
 }
 if(copy){
  try{await copy(url);return 'copied'}catch{/* Let the recipient select the link. */}
 }
 return 'manual'
}
