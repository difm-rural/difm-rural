import {allRows} from './relationshipHistory'
import {SUPPORT_AREAS,propertyAreaProgress,propertyJobCategory,type PropertyService} from './propertyNetwork'
import {formatDate} from './formatting.js'

type Query<T>=PromiseLike<{data:T[]|null;error:unknown}>&{eq:(key:string,value:string)=>Query<T>;in:(key:string,values:string[])=>Query<T>;order:(key:string,options?:{ascending:boolean})=>Query<T>;range:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:unknown}>}
type WriteQuery=PromiseLike<{error:unknown}>&{eq:(key:string,value:string)=>WriteQuery}
type Client={from:(table:string)=>{select:<T>(fields:string)=>Query<T>;upsert:(row:unknown,options?:unknown)=>PromiseLike<{error:unknown}>;delete:()=>WriteQuery}}
export type AreaJob={id:string;requester_id:string;title:string;status:string;category:string;created_at:string;provider?:string}
export type AreaJobLink={area:string;job_id:string}
export const PROPERTY_JOB_STATUSES=['open','accepted','completed']
export function propertyJobChoices(jobs:AreaJob[],links:AreaJobLink[],area:string){
 const ids=new Set(links.filter(link=>link.area===area).map(link=>link.job_id))
 return jobs.filter(job=>PROPERTY_JOB_STATUSES.includes(job.status)&&!ids.has(job.id))
}
export const propertyLinkedJobs=(jobs:AreaJob[],links:AreaJobLink[],area:string)=>{
 const ids=new Set(links.filter(link=>link.area===area).map(link=>link.job_id))
 return jobs.filter(job=>ids.has(job.id))
}
export function propertyNetworkCounts(areas:ReturnType<typeof import('./propertyNetwork').propertyAreas>){
 const active=areas.filter(area=>area.active)
 return {review:active.filter(area=>propertyAreaProgress(area).left>0).length,help:active.filter(area=>area.needsHelp).length}
}
export const propertyJobDate=(job:AreaJob)=>formatDate(job.created_at)
export function propertyJobPrefill(area:{id:string;label:string;category:string},service:Pick<PropertyService,'service_key'|'name'>){
 return {category:propertyJobCategory(area,service),service:area.label+': '+service.name,title:(service.name+' – '+area.label).slice(0,120)}
}
export function propertyPostParams(area:{id:string;label:string;category:string},service:Pick<PropertyService,'service_key'|'name'>,person?:{id:string;full_name?:string|null;display_name?:string|null}){
 return {prefill:propertyJobPrefill(area,service),...(person?{inviteProviderId:person.id,inviteProviderName:person.full_name||person.display_name||'Provider'}:{})}
}
export async function loadPropertyJobs(client:unknown,owner:string){
 const db=client as Client
 const [jobs,links]=await Promise.all([
  allRows(()=>db.from('jobs_public').select<AreaJob>('id,requester_id,title,status,category,created_at').eq('requester_id',owner).order('created_at',{ascending:false}).order('id')),
  allRows(()=>db.from('property_network_jobs').select<AreaJobLink>('area,job_id').eq('owner_id',owner).order('area').order('job_id')),
 ])
 const owned=jobs.filter(job=>job.requester_id===owner),ids=owned.map(job=>job.id)
 const bids:{job_id:string;provider_id:string}[]=[]
 for(let i=0;i<ids.length;i+=200)bids.push(...await allRows(()=>db.from('bids').select<{job_id:string;provider_id:string}>('job_id,provider_id').in('job_id',ids.slice(i,i+200)).eq('status','accepted').order('job_id')))
 const providerIds=[...new Set(bids.map(bid=>bid.provider_id))],people:{id:string;full_name:string|null}[]=[]
 for(let i=0;i<providerIds.length;i+=200)people.push(...await allRows(()=>db.from('profiles_public').select<{id:string;full_name:string|null}>('id,full_name').in('id',providerIds.slice(i,i+200)).order('id')))
 return {jobs:owned.map(job=>({...job,provider:people.find(person=>person.id===bids.find(bid=>bid.job_id===job.id)?.provider_id)?.full_name||undefined})),links}
}
export async function setPropertyJob(client:unknown,owner:string,area:string,job:AreaJob,link:boolean){
 if(job.requester_id!==owner||!SUPPORT_AREAS.some(row=>row.id===area)||link&&!PROPERTY_JOB_STATUSES.includes(job.status))throw new Error('Choose one of your active or completed jobs.')
 const db=client as Client
 const {error}=link?await db.from('property_network_jobs').upsert({owner_id:owner,area,job_id:job.id},{ignoreDuplicates:true})
  :await db.from('property_network_jobs').delete().eq('owner_id',owner).eq('area',area).eq('job_id',job.id)
 if(error)throw error
}

export function propertyPostPath(area:{id:string;label:string;category:string},service:Pick<PropertyService,'service_key'|'name'>,provider?:string){
 const prefill=propertyJobPrefill(area,service)
 return '/jobs/new?'+new URLSearchParams({category:prefill.category,title:prefill.title,...(provider?{invite:provider}:{})})
}

export async function replacePropertyProvider(client:unknown,service:Pick<PropertyService,'area'|'service_key'>,previous:string,provider:string){
 const {error}=await (client as {rpc:(name:string,args:Record<string,string>)=>PromiseLike<{error:unknown}>}).rpc('replace_property_network_provider',{
  p_area:service.area,p_service:service.service_key,p_previous:previous,p_provider:provider,
 })
 if(error)throw error
}
