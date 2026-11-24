import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {loadSavedProviders,providerInviteJobs,providerProfileUrl,providerServices,setProviderSaved,shareProviderLink} from '../shared/trustedLocals.ts'

test('saving providers is idempotent and removal is scoped to the requester and target',async()=>{
 const rows=new Map()
 const from=table=>{
  assert.equal(table,'saved_providers')
  return {
   insert:row=>{
    const key=row.requester_id+'/'+row.provider_id
    if(rows.has(key))return {error:{code:'23505'}}
    rows.set(key,row)
    return {error:null}
   },
   delete:()=>({eq:(owner,value)=>({eq:(provider,id)=>{
    assert.equal(owner,'requester_id')
    assert.equal(provider,'provider_id')
    rows.delete(value+'/'+id)
    return {error:null}
   }})}),
  }
 }
 const db={from}
 await setProviderSaved(db,'requester','provider',true)
 await setProviderSaved(db,'requester','provider',true)
 await setProviderSaved(db,'other','provider',true)
 assert.equal(rows.size,2)
 await setProviderSaved(db,'requester','provider',false)
 assert.deepEqual([...rows.keys()],['other/provider'])
})

test('independent saves use public projections and summarise active services',async()=>{
 const sources={
  saved_providers:[{requester_id:'me',provider_id:'provider'},{requester_id:'someone',provider_id:'other'}],
  profiles_public:[{id:'provider',full_name:'Provider',skills:['Fencing']}],
  services_public:[{provider_id:'provider',category:'Stock work',is_active:true,closed_at:null},{provider_id:'provider',category:'Retired service',is_active:true,closed_at:'yesterday'}],
 }
 const columns=[]
 const db={from:table=>({select:projection=>{
  columns.push(projection)
  let rows=sources[table]
  const query={
   eq(key,value){rows=rows.filter(row=>row[key]===value);return query},
   in(key,values){rows=rows.filter(row=>values.includes(row[key]));return query},
   is(key,value){return query.eq(key,value)},
   order(){return query},
   async range(){return {data:rows,error:null}},
  }
  return query
 }})}
 const saved=await loadSavedProviders(db,'me')
 assert.deepEqual(saved.map(row=>row.id),['provider'])
 assert.equal(providerServices(saved[0]),'Stock work')
 assert.ok(columns.every(projection=>!projection.includes('*')&&!/phone|address|latitude|email/.test(projection)))
 // The same provider may also exist in an independent work-history result.
 assert.equal(saved.find(row=>row.id==='provider').id,[{personId:'provider'}][0].personId)
})

test('both first-time and previous providers can choose open jobs, with active duplicates excluded',()=>{
 const jobs=[{id:'a',title:'A'},{id:'b',title:'B'},{id:'c',title:'C'}]
 const invites=[
  {job_id:'a',provider_id:'prior',status:'pending',revision:1},
  {job_id:'b',provider_id:'prior',status:'withdrawn',revision:2},
  {job_id:'c',provider_id:'other',status:'seen',revision:1},
 ]
 assert.deepEqual(providerInviteJobs(jobs,invites,'saved').map(row=>row.id),['a','b','c'])
 assert.deepEqual(providerInviteJobs(jobs,invites,'prior').map(row=>[row.id,row.revision]),[['b',2],['c',undefined]])
 assert.deepEqual(providerInviteJobs([],invites,'saved'),[])
})

test('public share URL supports copy fallback and respects dismissed share sheets',async()=>{
 const url=providerProfileUrl('provider')
 assert.equal(url,'https://dev.ruralconnections.nz/people/provider')
 let copied
 assert.equal(await shareProviderLink(undefined,async value=>{copied=value},url),'copied')
 assert.equal(copied,url)
 assert.equal(await shareProviderLink(async data=>assert.equal(data.url,url),undefined,url),'shared')
 const abort=new Error('dismissed');abort.name='AbortError'
 assert.equal(await shareProviderLink(async()=>{throw abort},undefined,url),'cancelled')
 assert.equal(await shareProviderLink(undefined,async()=>{throw Error()},url),'manual')
})

test('guest profile returns before private queries and shared navigation stays inside existing screens',()=>{
 const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8')
 const page=source('provider-web/src/app/people/[id]/page.tsx')
 const guest=page.split('if(!viewer){')[1].split('const {supabase,user,profile}')[0]
 assert.match(guest,/loadPublicProfile\(publicClient,id\)/)
 assert.doesNotMatch(guest,/saved_providers|loadConnections|appShell|\.from\(/)
 for(const file of ['provider-web/src/app/connections/page.tsx','src/screens/ConnectionsScreen.js']){
  const view=source(file)
  assert.match(view,/Worked together/)
  assert.match(view,/Browse local providers/)
  assert.match(view,/relationshipLabels/)
 }
})
