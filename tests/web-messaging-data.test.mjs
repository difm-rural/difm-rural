import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
const source=(await readFile(new URL('../provider-web/src/lib/messaging-data.ts',import.meta.url),'utf8'))
  .replace("from './messaging'",`from '${new URL('../provider-web/src/lib/messaging.ts',import.meta.url).href}'`)
const {loadConversation,loadInbox}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'))
const me='00000000-0000-0000-0000-000000000001',provider='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003',subject='00000000-0000-0000-0000-000000000004'
function clientFor(tables,failTable){
  const calls=[]
  return {calls,from(table){
    calls.push({table});let rows=[...(tables[table] || [])]
    const result=()=>({data:rows,error:table===failTable?new Error('Offline'):null})
    const q={select(){return q},eq(key,value){calls.push({table,key,value});rows=rows.filter(r=>r[key]===value);return q},
      or(filter){calls.push({table,filter});return q},order(){return q},
      in(key,values){rows=rows.filter(r=>values.includes(r[key]));return q},
      async range(a,b){const r=result();return {...r,data:r.data.slice(a,b+1)}},
      async maybeSingle(){const r=result();return {...r,data:r.data[0] || null}},
      then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)},
    };return q
  }}
}
test('fresh enquiries can start only with the listing owner; invalid references make no queries',async()=>{
  const client=clientFor({services:[{id:subject,title:'Grazing',provider_id:provider,is_active:true,closed_at:null}],profiles_public:[{id:provider,full_name:'Peter'}]})
  const context=await loadConversation(client,me,{kind:'listing',id:subject,person:provider})
  assert.equal(context.closed,false);assert.equal(context.name,'Peter');assert.equal(context.messages.length,0)
  assert.equal(await loadConversation(client,me,{kind:'listing',id:subject,person:other}),null)
  assert.equal(await loadConversation(client,provider,{kind:'listing',id:subject,person:me}),null)
  const before=client.calls.length
  assert.equal(await loadConversation(client,me,{kind:'listing',id:'bad),id.eq.other',person:provider}),null)
  assert.equal(client.calls.length,before)
})
test('booking context derives both participants from the booking; completed chats are read-only',async()=>{
  const client=clientFor({bookings:[{id:subject,requester_id:me,provider_id:provider,status:'completed',service:{title:'Water delivery'}}],profiles_public:[{id:provider,full_name:'Peter'}]})
  const context=await loadConversation(client,me,{kind:'booking',id:subject,person:provider})
  assert.equal(context.closed,true)
  assert.equal(await loadConversation(client,me,{kind:'booking',id:subject,person:other}),null)
  assert.equal(await loadConversation(client,other,{kind:'booking',id:subject,person:provider}),null)
})
test('job conversations use jobs_public and require the accepted provider',async()=>{
  const client=clientFor({jobs_public:[{id:subject,title:'Fence',requester_id:me,status:'accepted'}],bids:[{job_id:subject,provider_id:provider,status:'accepted'}],profiles_public:[{id:provider,full_name:'Peter'}]})
  const context=await loadConversation(client,me,{kind:'job',id:subject,person:provider})
  assert.equal(context.closed,false)
  assert.equal(await loadConversation(client,me,{kind:'job',id:subject,person:other}),null)
  assert.ok(client.calls.some(c=>c.table==='jobs_public'))
  assert.ok(!client.calls.some(c=>c.table==='jobs' || c.table==='profiles'))
})
test('inbox retrieval scopes both message tables to the current user and fails honestly offline',async()=>{
  const client=clientFor({messages:[{id:'m',service_id:subject,sender_id:me,receiver_id:provider,content:'Hello',created_at:'2026-10-19T00:00:00Z'}],services:[{id:subject,title:'Grazing'}],profiles_public:[{id:provider,full_name:'Peter'}]})
  const rows=await loadInbox(client,me,[])
  assert.equal(rows.length,1);assert.equal(rows[0].preview,'You: Hello');assert.equal(rows[0].name,'Peter')
  for(const table of ['messages','service_booking_messages'])assert.ok(client.calls.some(c=>c.table===table && c.filter===`sender_id.eq.${me},receiver_id.eq.${me}`))
  await assert.rejects(loadInbox(clientFor({},'messages'),me,[]),/Offline/)
})
