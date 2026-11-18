import type {SupabaseClient} from '@supabase/supabase-js'
import {allRows} from './discovery-data'
import {completedRelationshipJobs,relationshipColumn,relationshipPair,type RelationshipSide} from '@shared/relationshipHistory'
export type ConnectionRow={requester_id:string;provider_id:string;times_worked:number;jobs_count:number;bookings_count:number;first_engaged_at:string;last_engaged_at:string;categories:string[]}
export type Connection={personId:string;times:number;jobs:number;bookings:number;first:string;last:string;categories:string[];canInvite:boolean;providedForYou:boolean;requestedYourHelp:boolean;person:{id:string;full_name:string|null;avatar_url:string|null;region:string|null}|null}
export function groupConnections(rows:ConnectionRow[],userId:string){
 const map=new Map<string,Omit<Connection,'person'>>()
 for(const r of rows){if(r.requester_id!==userId&&r.provider_id!==userId)continue;const other=r.requester_id===userId?r.provider_id:r.requester_id;if(!other||other===userId)continue
 const previous=map.get(other),categories=[...new Set([...(previous?.categories || []),...(r.categories || [])].filter(c=>typeof c==='string'))]
 map.set(other,{personId:other,times:(previous?.times || 0)+r.times_worked,jobs:(previous?.jobs || 0)+r.jobs_count,bookings:(previous?.bookings || 0)+r.bookings_count,first:previous&&previous.first<r.first_engaged_at?previous.first:r.first_engaged_at,last:previous&&previous.last>r.last_engaged_at?previous.last:r.last_engaged_at,categories,canInvite:!!previous?.canInvite||r.requester_id===userId,providedForYou:!!previous?.providedForYou||r.requester_id===userId,requestedYourHelp:!!previous?.requestedYourHelp||r.provider_id===userId})}
 return [...map.values()].sort((a,b)=>b.last.localeCompare(a.last)||a.personId.localeCompare(b.personId))
}
export async function loadConnections(client:SupabaseClient,userId:string,side?:RelationshipSide,personId?:string):Promise<Connection[]>{
 const rows=await allRows<ConnectionRow>(()=>{
  const query=client.from('connections').select('requester_id,provider_id,times_worked,jobs_count,bookings_count,first_engaged_at,last_engaged_at,categories')
  if(side){
   query.eq(relationshipColumn(side),userId)
   if(personId)query.eq(side==='locals'?'provider_id':'requester_id',personId)
  }else query.or('requester_id.eq.'+userId+',provider_id.eq.'+userId)
  return query.order('requester_id').order('provider_id')
 })
 const grouped=groupConnections(rows,userId),people:NonNullable<Connection['person']>[]=[]
 for(let i=0;i<grouped.length;i+=200){const ids=grouped.slice(i,i+200).map(c=>c.personId);people.push(...await allRows<NonNullable<Connection['person']>>(()=>client.from('profiles_public').select('id,full_name,avatar_url,region').in('id',ids).order('id')))}
 return grouped.map(c=>({...c,person:people.find(p=>p.id===c.personId) || null}))
}
export type SharedWork={id:string;kind:'job'|'booking';title:string;created_at:string}
export async function connectionHistory(client:SupabaseClient,userId:string,otherId:string,side?:RelationshipSide){
 const sides:RelationshipSide[]=side?[side]:['locals','customers']
 const result=(await Promise.all(sides.map(async direction=>{
  const {requester,provider}=relationshipPair(userId,otherId,direction)
  const [jobs,bookings]=await Promise.all([
   completedRelationshipJobs(client,requester,provider),
   allRows<{id:string;created_at:string;service:{title:string}|{title:string}[]|null}>(()=>client.from('bookings')
    .select('id,created_at,service:services(title)').eq('requester_id',requester).eq('provider_id',provider).eq('status','completed').order('id')),
  ])
  return [
   ...jobs.map(job=>({...job,kind:'job' as const})),
   ...bookings.map(b=>({id:b.id,title:(Array.isArray(b.service)?b.service[0]:b.service)?.title || 'Booking',created_at:b.created_at,kind:'booking' as const})),
  ]
 }))).flat()
 return result.sort((a,b)=>b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id))
}
