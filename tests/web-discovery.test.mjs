import assert from 'node:assert/strict'
import test from 'node:test'
import {discovery,data,connections,actions,invites,origin} from './web-discovery-modules.mjs'
import {notificationHref} from '../provider-web/src/lib/work.ts'
const {discoveryFilters,discover,coordinates,distanceKm,savedSearchInput,discoveryHref}=discovery
const me='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',stranger='00000000-0000-0000-0000-000000000003',jobId='10000000-0000-0000-0000-000000000001'
const form=values=>{const f=new FormData();for(const [key,value] of Object.entries(values))f.append(key,String(value));return f}
function client(tables,failTable){const calls=[];return {calls,from(table){calls.push(['from',table]);let rows=[...(tables[table] || [])],write=null;const q={select(cols){calls.push(['select',table,cols]);return q},eq(key,value){calls.push(['eq',table,key,value]);rows=rows.filter(r=>r[key]===value);return q},is(key,value){rows=rows.filter(r=>r[key]===value);return q},in(key,values){rows=rows.filter(r=>values.includes(r[key]));return q},or(value){calls.push(['or',table,value]);return q},order(){return q},async range(a,b){calls.push(['range',table,a,b]);return {data:rows.slice(a,b+1),error:table===failTable?new Error('Offline'):null}},async maybeSingle(){return {data:rows[0] || null,error:table===failTable?new Error('Offline'):null}},upsert(value,options){calls.push(['upsert',table,value,options]);return {error:table===failTable?new Error('Offline'):null}},delete(){write='delete';return q},update(patch){write=patch;return q},then(resolve){calls.push(['commit',table,write,rows]);return Promise.resolve({data:rows,error:table===failTable?new Error('Offline'):null}).then(resolve)}};return q},async rpc(name,args){calls.push(['rpc',name,args]);return {error:null}}}}
function cookies(){const values=new Map(),calls=[];return {calls,get:key=>values.has(key)?{value:values.get(key)}:undefined,set(key,value,options){values.set(key,value);calls.push(['set',key,value,options])},delete(key){values.delete(key);calls.push(['delete',key])}}}
const row=(id,patch={})=>({id,title:'Fence repair',description:'Repair posts',category:'Fencing',location_area:'Waikato',created_at:'2026-10-20T00:00:00Z',latitude:null,longitude:null,...patch})
test('search includes descriptions, categories and visible areas, with literal punctuation',()=>{
 const rows=[row('1',{description:'Water delivery'}),row('2',{category:'Waterways'}),row('3',{location_area:'Waterford'}),row('4',{title:'%"(), literal'})]
 assert.equal(discover(rows,discoveryFilters({q:'WATER'}),null).count,3)
 assert.equal(discover(rows,discoveryFilters({q:'%"(),'}),null).count,1)
 assert.equal(discoveryFilters({category:'invented',kind:'bad',sort:'bad',radius:'NaN',page:'-9'}).category,'')
 assert.equal(discoveryFilters({radius:'30'}).radius,30)
})
test('distance never fabricates coordinates for hidden pins and unknown distances sort last',()=>{
 const point=coordinates(0,0);assert.deepEqual(point,{latitude:0,longitude:0});assert.equal(coordinates(null,0),null);assert.equal(coordinates(91,0),null)
 assert.ok(Math.abs(distanceKm(point,{latitude:1,longitude:0})-111.195)<.01)
 const rows=[row('hidden'),row('far',{latitude:1,longitude:0}),row('near',{latitude:.01,longitude:0})]
 const near=discover(rows,discoveryFilters({sort:'nearest'}),point);assert.deepEqual(near.rows.map(r=>r.id),['near','far','hidden']);assert.equal(near.rows[2].distance,null)
 assert.deepEqual(discover(rows,discoveryFilters({radius:'10'}),point).rows.map(r=>r.id),['near'])
 assert.equal(discover(rows,discoveryFilters({}),null).count,3)
})
test('pagination follows filtering and preserves query state in links',()=>{
 const rows=Array.from({length:650},(_,i)=>row(String(i),{title:i===601?'Needle':'Other'}))
 assert.equal(discover(rows,discoveryFilters({q:'needle'}),null).rows[0].id,'601')
 const result=discover(rows.slice(0,23),discoveryFilters({page:'99'}),null);assert.equal(result.page,2);assert.equal(result.rows.length,3)
 const href=discoveryHref('/jobs',{q:'tractor & trailer',page:2,radius:30,sort:'nearest'});assert.match(href,/page=2/);assert.equal(new URL(href,'https://example.com').searchParams.get('q'),'tractor & trailer')
 assert.doesNotMatch(href,/latitude|longitude/)
})
test('database discovery pages beyond 500, uses jobs_public, and rejects failed loads',async()=>{
 const jobs=Array.from({length:650},(_,i)=>row(String(i),{status:'open',visibility:'public'})),c=client({jobs_public:jobs})
 assert.equal((await data.loadDiscoveryJobs(c)).length,650);assert.ok(c.calls.some(v=>v[0]==='range'&&v[2]===500));assert.ok(c.calls.some(v=>v[0]==='eq'&&v[2]==='visibility'&&v[3]==='public'))
 assert.equal(c.calls.some(v=>v[0]==='from'&&v[1]==='jobs'),false)
 await assert.rejects(data.loadDiscoveryJobs(client({},'jobs_public')),/Offline/)
})
test('saved searches reuse app filter keys and require coordinates only for distance filters',()=>{
 const values={name:'Tractor',q:' Tractor ',frequency:'off',radius:'25',push_enabled:'on',email_enabled:'on'},point={latitude:-37.123456,longitude:175.654321}
 assert.equal(savedSearchInput(form(values),null).ok,false)
 const r=savedSearchInput(form(values),point);assert.equal(r.ok,true);assert.equal(r.value.push_enabled,false);assert.equal(r.value.email_enabled,false)
 assert.deepEqual(JSON.parse(r.value.filter_key),{kind:'saved_search',query:'tractor',category:'',latitude:'-37.1235',longitude:'175.6543',radius_km:25})
 assert.equal(savedSearchInput(form({...values,radius:'',frequency:'daily'}),null).value.latitude,null)
})
test('connection grouping merges both roles and excludes unrelated relationships',()=>{
 const base={times_worked:2,jobs_count:1,bookings_count:1,first_engaged_at:'2026-01-01',last_engaged_at:'2026-02-01',categories:['Fencing']}
 const grouped=connections.groupConnections([{...base,requester_id:me,provider_id:other},{...base,times_worked:1,jobs_count:1,bookings_count:0,requester_id:other,provider_id:me,last_engaged_at:'2026-03-01'},{...base,requester_id:other,provider_id:stranger}],me)
 assert.equal(grouped.length,1);assert.equal(grouped[0].times,3);assert.equal(grouped[0].last,'2026-03-01');assert.equal(grouped[0].canInvite,true);assert.equal(grouped[0].requestedYourHelp,true)
})
test('connections read public profiles and scope shared work to both participants',async()=>{
 const base={times_worked:1,jobs_count:1,bookings_count:0,first_engaged_at:'2026-01-01',last_engaged_at:'2026-02-01',categories:[]},c=client({connections:[{...base,requester_id:me,provider_id:other}],profiles_public:[{id:other,full_name:'Peter'}],bids:[{job_id:jobId,provider_id:other,status:'accepted'}],jobs_public:[{id:jobId,requester_id:me,status:'completed',title:'Our fence',created_at:'2026-01-01'},{id:'unrelated',requester_id:stranger,status:'completed',title:'Private',created_at:'2026-01-01'}],bookings:[]})
 assert.equal((await connections.loadConnections(c,me))[0].person.full_name,'Peter')
 assert.deepEqual((await connections.connectionHistory(c,me,other)).map(r=>r.title),['Our fence'])
 assert.equal(c.calls.some(v=>v[0]==='from'&&['profiles','jobs'].includes(v[1])),false)
 const cols=c.calls.filter(v=>v[0]==='select'&&v[1]==='profiles_public').map(v=>v[2]).join(',');assert.doesNotMatch(cols,/phone|address|latitude|longitude/)
})
test('saved job and interest mutations derive ownership from sign-in',async()=>{
 const c=client({jobs_public:[{id:jobId}],saved_interests:[{id:jobId,user_id:other}]});globalThis.__discoveryAuth={supabase:c,user:{id:me}}
 assert.equal((await actions.saveWatchedJob({error:''},form({job_id:jobId,user_id:other}))).error,'')
 const write=c.calls.find(v=>v[0]==='upsert');assert.equal(write[2].user_id,me)
 assert.ok((await actions.manageInterest({error:''},form({id:jobId,intent:'remove',confirmed:'on'}))).error)
 assert.ok(c.calls.some(v=>v[0]==='eq'&&v[1]==='saved_interests'&&v[2]==='user_id'&&v[3]===me))
})
test('temporary browsing location is scoped to the account and stored off the URL',async()=>{
 const c=client({profiles:[{id:me,latitude:-37,longitude:175}]}),jar=cookies();globalThis.__discoveryAuth={supabase:c,user:{id:me}};globalThis.__discoveryCookies=jar
 await actions.setBrowsingLocation(0,0);const set=jar.calls.find(v=>v[0]==='set');assert.equal(set[3].httpOnly,true);assert.equal(set[3].maxAge,21600);assert.equal(JSON.parse(set[2]).userId,me)
 assert.deepEqual((await origin.browsingOrigin(c,me)).point,{latitude:0,longitude:0})
 assert.deepEqual((await origin.browsingOrigin(c,other)).point,null)
 await actions.setBrowsingLocation(null,null);assert.deepEqual((await origin.browsingOrigin(c,me)).point,{latitude:-37,longitude:175})
})
test('invites require confirmation and only use the guarded RPC',async()=>{
 const c=client({});globalThis.__discoveryAuth={supabase:c,user:{id:me}}
 assert.ok((await invites.inviteConnection({error:''},form({job_id:jobId,person_id:other}))).error)
 assert.equal(c.calls.some(v=>v[0]==='rpc'),false)
 assert.equal((await invites.inviteConnection({error:''},form({job_id:jobId,person_id:other,confirmed:'on'}))).error,'')
 assert.deepEqual(c.calls.find(v=>v[0]==='rpc').slice(1),['invite_connection_to_job',{p_job_id:jobId,p_provider_id:other}])
})
test('saved alert notifications reopen their search; individual matches reopen the job',()=>{
 assert.equal(notificationHref({type:'saved_interest_digest',metadata:{saved_interest_id:jobId}}),'/jobs?interest='+jobId)
 assert.equal(notificationHref({type:'saved_interest_match',metadata:{saved_interest_id:jobId,job_id:jobId}}),'/jobs/'+jobId)
})
