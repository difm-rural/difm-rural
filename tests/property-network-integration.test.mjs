import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {loadPropertyJobs,propertyJobChoices,propertyLinkedJobs,propertyNetworkCounts,propertyJobPrefill,propertyPostParams,propertyPostPath,setPropertyJob,replacePropertyProvider} from '../shared/propertyNetworkJobs.ts'
import {SUPPORT_AREAS,propertyAreas,setPropertyProvider} from '../shared/propertyNetwork.ts'
import {openWizard} from './support/post-job-wizard.mjs'
const owner='owner',job=(id,status='open',requester_id=owner)=>({id,status,requester_id,title:'Job '+id,category:'Buildings & Maintenance',created_at:'2026-11-22'})
function database({jobs=[job('active','accepted'),job('done','completed'),job('other','open','someone')],links=[{area:'water',job_id:'done'}],fail=null}={}){
 const calls=[],writes=[]
 const db={from(table){
  const call={table,filters:[],fields:''};calls.push(call)
  const query={eq(key,value){call.filters.push([key,value]);return query},in(key,value){call.filters.push([key,value]);return query},order(){return query},async range(start,end){
   if(table===fail)return {data:null,error:new Error('read failed')}
   const rows=table==='jobs_public'?jobs:table==='property_network_jobs'?links:table==='bids'?[{job_id:'done',provider_id:'p'}]:table==='profiles_public'?[{id:'p',full_name:'Peter'}]:[]
   return {data:rows.slice(start,end+1),error:null}
  },then(resolve){return Promise.resolve({error:null}).then(resolve)}}
  return {select(fields){call.fields=fields;return query},upsert(row,options){writes.push({table,row,options});return Promise.resolve({error:null})},delete(){writes.push({table,delete:true,filters:call.filters});return query}}
 },rpc:async(name,args)=>{writes.push({name,args});return {error:null}}}
 return {db,calls,writes}
}
test('job history reads existing owner-scoped records and accepted provider identity, with explicit links only',async()=>{
 const {db,calls}=database(),data=await loadPropertyJobs(db,owner)
 assert.deepEqual(data.jobs.map(j=>j.id),['active','done']);assert.equal(data.jobs[1].provider,'Peter')
 assert.deepEqual(propertyLinkedJobs(data.jobs,data.links,'water').map(j=>j.id),['done'])
 assert.deepEqual(propertyLinkedJobs(data.jobs,data.links,'upkeep'),[],'Buildings & Maintenance never guesses an area')
 assert.deepEqual(propertyJobChoices(data.jobs,data.links,'water').map(j=>j.id),['active'])
 assert.ok(calls.find(c=>c.table==='jobs_public').filters.some(([k,v])=>k==='requester_id'&&v===owner))
 assert.ok(calls.find(c=>c.table==='property_network_jobs').filters.some(([k,v])=>k==='owner_id'&&v===owner))
 assert.ok(!calls.some(c=>c.table==='jobs'))
})
test('link and unlink are owner scoped and idempotent without modifying job or provider relationships',async()=>{
 const {db,writes}=database();await setPropertyJob(db,owner,'water',job('j'),true);await setPropertyJob(db,owner,'water',job('j'),false)
 assert.deepEqual(writes[0],{table:'property_network_jobs',row:{owner_id:owner,area:'water',job_id:'j'},options:{ignoreDuplicates:true}})
 assert.deepEqual(writes[1].filters,[['owner_id',owner],['area','water'],['job_id','j']])
 for(const bad of [job('x','open','other'),job('x','cancelled')])await assert.rejects(()=>setPropertyJob(db,owner,'water',bad,true))
 await assert.rejects(()=>setPropertyJob(db,owner,'invalid',job('x'),true))
 assert.equal(writes.length,2)
})
test('failed history/association reads surface errors instead of claiming an empty network',async()=>{
 for(const table of ['property_network_jobs','jobs_public','bids','profiles_public'])await assert.rejects(()=>loadPropertyJobs(database({fail:table}).db,owner))
})
test('existing provider assignment RPC and scoped removal preserve member identities',async()=>{
 const {db,writes}=database(),service={area:'water',service_key:'suggested-1',name:'Water delivery',status:'sorted'}
 await setPropertyProvider(db,owner,service,'p',true);await setPropertyProvider(db,owner,service,'p',false)
 assert.equal(writes[0].name,'link_property_network_provider');assert.equal(writes[0].args.p_provider,'p')
 assert.equal(writes[1].table,'property_network_providers');assert.ok(writes[1].filters.some(([k,v])=>k==='owner_id'&&v===owner))
 assert.ok(!writes.some(w=>['profiles','notifications','connections'].includes(w.table)))
})
test('area counts distinguish unanswered areas from Needs help services and ignore hidden areas',()=>{
 const empty={preferences:[{area:'water',active:true},{area:'upkeep',active:true}],services:[],links:[]}
 let areas=propertyAreas(empty);assert.deepEqual(propertyNetworkCounts(areas),{review:2,help:0})
 areas=propertyAreas({...empty,services:[{area:'water',service_key:'suggested-1',name:'Water delivery',status:'needs_help'},{area:'water',service_key:'suggested-2',name:'Tank cleaning',status:'needs_help'},{area:'land',service_key:'suggested-1',name:'Mowing',status:'needs_help'}]})
 assert.deepEqual(propertyNetworkCounts(areas),{review:2,help:1},'two services in one area count as one area')
})
test('area context and optional provider invitation use the same editable job wizard',async()=>{
 const area=SUPPORT_AREAS.find(a=>a.id==='water'),service={service_key:area.services[0].key,name:area.services[0].name}
 const params=propertyPostParams(area,service,{id:'p',full_name:'Peter'})
 assert.equal(params.inviteProviderId,'p');assert.equal(params.prefill.category,'Water & Drainage');assert.ok(params.prefill.title.includes('Water'))
 const wizard=await openWizard({params});assert.equal(wizard.context().jobData.title,params.prefill.title)
 await wizard.type('Job title','My edited maintenance request');await wizard.choose("I'm flexible");await wizard.next();await wizard.map({latitude:-38,longitude:176});await wizard.next();await wizard.type('Job description','My editable requirements.');await wizard.next();await wizard.choose('Open to offers');await wizard.next();await wizard.press('Send invitation')
 assert.equal(wizard.log.rpc.at(-1)[0],'create_invited_job');assert.equal(wizard.log.rpc.at(-1)[1].p_provider_id,'p')
 assert.ok(JSON.stringify(wizard.log.rpc.at(-1)[1]).includes('My edited maintenance request'))
 const href=new URL(propertyPostPath(area,service,'p'),'https://example.com');assert.equal(href.pathname,'/jobs/new');assert.equal(href.searchParams.get('invite'),'p');assert.equal(href.searchParams.get('title'),params.prefill.title)
 assert.ok(!propertyPostParams(area,service).inviteProviderId)
})
test('mobile and web job rows navigate to the existing job and keep private link failures actionable',()=>{
 const app=readFileSync(new URL('../src/components/PropertyAreaJobs.js',import.meta.url),'utf8'),web=readFileSync(new URL('../provider-web/src/app/property-network/property-area-jobs.tsx',import.meta.url),'utf8')
 assert.match(app,/navigation.navigate\('JobDetail',\{job\}\)/);assert.match(web,/href=\{'\/jobs\/'\+job.id\}/)
 for(const text of [app,web]){assert.match(text,/No jobs linked to this area yet/);assert.match(text,/Could not load linked jobs/);assert.match(text,/propertyJobChoices/)}
})



test('changing a provider uses one transactional private-assignment RPC',async()=>{
 const {db,writes}=database();await replacePropertyProvider(db,{area:'water',service_key:'suggested-1'},'previous','next')
 assert.deepEqual(writes,[{name:'replace_property_network_provider',args:{p_area:'water',p_service:'suggested-1',p_previous:'previous',p_provider:'next'}}])
 await assert.rejects(()=>replacePropertyProvider({rpc:async()=>({error:new Error('not allowed')})},{area:'water',service_key:'suggested-1'},'previous','next'))
})
