import test from 'node:test'
import assert from 'node:assert/strict'
import {openWizard} from './support/post-job-wizard.mjs'
import {SUPPORT_AREAS} from '../shared/propertyNetwork.ts'
import {propertyPostParams,propertyPostPath,propertyJobOrigin,linkPostedPropertyJob} from '../shared/propertyNetworkJobs.ts'
const area=SUPPORT_AREAS.find(a=>a.id==='water'),service={service_key:area.services[0].key,name:area.services[0].name}
const origin={ownerId:'me',area:'water'}
async function ready({invite=false,property=true,wrongOwner=false}={}){
 const params=property?propertyPostParams(area,service,invite?{id:'p',full_name:'Peter'}:undefined,wrongOwner?'other':'me'):{prefill:{title:'Ordinary repair job'}}
 const wizard=await openWizard({params});await wizard.choose("I'm flexible");await wizard.next();await wizard.map({latitude:-38,longitude:176});await wizard.next();await wizard.type('Job description','Fix the trough pipe.');await wizard.next();await wizard.choose('Open to offers');await wizard.next()
 return wizard
}
for(const invite of [false,true])test('successful '+(invite?'invited':'public')+' posting retains the property origin and links the created job privately',async()=>{
 const wizard=await ready({invite});assert.deepEqual(wizard.context().jobData.propertyOrigin,origin)
 await wizard.press(invite?'Send invitation':'Post job');assert.equal(wizard.step(),'JobPosted')
 assert.equal(wizard.log.links.length,1);assert.deepEqual(wizard.log.links[0],{table:'property_network_jobs',value:{owner_id:'me',area:'water',job_id:'new'},options:{ignoreDuplicates:true}})
 assert.deepEqual(wizard.params().propertyOrigin,origin);assert.equal(wizard.context().jobData.propertyOrigin,null)
 const payload=invite?wizard.log.rpc.find(([name])=>name==='create_invited_job')[1].p_details:wizard.log.inserts[0]
 assert.equal(payload.propertyOrigin,undefined);assert.equal(payload.property_owner,undefined)
})
test('cancelling before publishing never creates a job or association, and the next ordinary draft has no origin',async()=>{
 const wizard=await ready();await wizard.leave();assert.deepEqual(wizard.log.links,[]);assert.deepEqual(wizard.log.inserts,[])
 await wizard.open({});assert.equal(wizard.context().jobData.propertyOrigin,null)
})
for(const invite of [false,true])test('failed '+(invite?'invited':'public')+' job creation never creates an area link',async()=>{
 const wizard=await ready({invite});wizard.log.postFails=true;await wizard.press(invite?'Send invitation':'Post job');assert.equal(wizard.step(),'PostJobStep5Review');assert.deepEqual(wizard.log.links,[])
})
test('an ordinary new job remains outside Property Network',async()=>{
 const wizard=await ready({property:false});await wizard.press('Post job');assert.equal(wizard.step(),'JobPosted');assert.deepEqual(wizard.log.links,[])
})
test('posting for a different property owner is refused before job creation',async()=>{
 const wizard=await ready({wrongOwner:true});await wizard.press('Post job');assert.equal(wizard.step(),'PostJobStep5Review');assert.deepEqual(wizard.log.inserts,[]);assert.deepEqual(wizard.log.links,[])
})
test('an association failure preserves the successful job and warns against reposting it',async()=>{
 const wizard=await ready();wizard.log.linkFails=true;await wizard.press('Post job');assert.equal(wizard.step(),'JobPosted');assert.equal(wizard.log.inserts.length,1);assert.match(wizard.params().body,/job was posted.*could not be linked.*do not post it again/)
})
test('repeat association attempts are conflict-safe and wrong-owner origins cannot reach storage',async()=>{
 const rows=new Map(),calls=[];const client={from:table=>({upsert:async(row,options)=>{calls.push({table,options});rows.set([row.owner_id,row.area,row.job_id].join(':'),row);return {error:null}}})}
 await linkPostedPropertyJob(client,origin,'me','job');await linkPostedPropertyJob(client,origin,'me','job');assert.equal(rows.size,1);assert.ok(calls.every(c=>c.options.ignoreDuplicates===true))
 await assert.rejects(()=>linkPostedPropertyJob(client,origin,'other','job'));assert.equal(calls.length,2)
 await linkPostedPropertyJob(client,null,'me','job');assert.equal(calls.length,2)
 assert.throws(()=>propertyJobOrigin({ownerId:'me',area:'invalid'},'me'))
 const url=new URL(propertyPostPath(area,service,undefined,'me'),'https://example.com');assert.equal(url.searchParams.get('property_owner'),'me');assert.equal(url.searchParams.get('property_area'),'water')
})

test('expired authentication never transfers the property draft into another account or creates work',async()=>{
 const wizard=await ready();wizard.log.userId=null;await wizard.press('Post job')
 assert.deepEqual(wizard.log.inserts,[]);assert.deepEqual(wizard.log.links,[]);assert.equal(wizard.log.alerts.at(-1)[0],'Sign in again')
})

test('with the "Job posted" step switched off, posting opens the new job with a notice',async()=>{
 globalThis.__showJobPosted=false
 try{
  const wizard=await ready({property:false})
  await wizard.press('Post job')
  assert.equal(wizard.step(),'ManageTask')
  assert.equal(wizard.params().posted,'Job posted.')
  assert.equal(wizard.params().job.id,'new');assert.equal(wizard.params().job.status,'open')
  // The posting steps are gone from the stack: Back returns to where posting started.
  assert.ok(!wizard.names().some(name=>name.startsWith('PostJob')))
  assert.equal(wizard.log.inserts.length,1)
 }finally{delete globalThis.__showJobPosted}
})
