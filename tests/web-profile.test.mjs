import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
let source=await readFile(new URL('../provider-web/src/lib/profile-input.ts',import.meta.url),'utf8')
for(const name of ['categories','providerAvailability'])source=source.replace(`'@shared/${name}'`,`'${new URL('../shared/'+name+'.ts',import.meta.url).href}'`)
const inputUrl='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const {profileInput,availabilityInput,preferencesInput,nzToday,PUBLIC_PROFILE_COLUMNS}=await import(inputUrl)
const form=values=>{const f=new FormData();for(const [k,v] of Object.entries(values))for(const value of Array.isArray(v)?v:[v])f.append(k,value);return f}
const valid={full_name:' Paul ',region:'Waikato',phone:'+64 21 123 4567'}
test('profile patch keeps public names consistent and excludes privileged fields',()=>{
 const r=profileInput(form({...valid,id:'other',role:'admin',email:'other@example.com'}),{},'me','https://example.com')
 assert.equal(r.ok,true);assert.equal(r.value.full_name,'Paul');assert.equal(r.value.display_name,'Paul')
 for(const key of ['id','role','email','created_at','availability_status'])assert.equal(key in r.value,false)
 assert.equal(profileInput(form({...valid,phone:'abc'}),{},'me','').ok,false)
 assert.equal(profileInput(form({...valid,full_name:' '}),{},'me','').ok,false)
})
test('GPS pairs, skills and avatar ownership are validated',()=>{
 for(const coords of [{latitude:'91',longitude:'0'},{latitude:'1'},{latitude:'NaN',longitude:'2'}])assert.equal(profileInput(form({...valid,...coords}),{},'me','').ok,false)
 assert.equal(profileInput(form({...valid,skills:['Legacy skill']}),{skills:['Legacy skill']},'me','').ok,true)
 assert.equal(profileInput(form({...valid,skills:['Invented skill']}),{},'me','').ok,false)
 assert.equal(profileInput(form({...valid,avatar_url:'https://example.com/storage/v1/object/public/avatars/other/a.jpg'}),{},'me','https://example.com').ok,false)
 assert.equal(profileInput(form({...valid,avatar_url:'https://example.com/storage/v1/object/public/avatars/me/a.jpg'}),{},'me','https://example.com').ok,true)
 for(const pii of ['phone','address','latitude','longitude','email'])assert.equal(PUBLIC_PROFILE_COLUMNS.split(',').includes(pii),false)
})
test('availability dates use the NZ day and reject impossible or past dates',()=>{
 const now=new Date('2026-10-19T12:30:00Z');assert.equal(nzToday(now),'2026-10-20')
 for(const date of ['2026-10-19','2026-02-30','bad'])assert.equal(availabilityInput(form({availability_status:'unavailable_until',availability_until:date}),now).ok,false)
 assert.equal(availabilityInput(form({availability_status:'unavailable_until',availability_until:'2026-10-20'}),now).ok,true)
 assert.equal(availabilityInput(form({availability_status:'available_now',availability_until:'bad'}),now).value.availability_until,null)
 assert.equal(availabilityInput(form({availability_status:'invented'}),now).ok,false)
})
test('preferences patch is limited to supported switches and matching settings',()=>{
 const r=preferencesInput(form({opportunity_alert_mode:'daily',opportunity_radius_km:'30',email_messages:'on',user_id:'other',notifications_enabled:'off'}))
 assert.equal(r.ok,true);assert.equal(r.value.email_messages,true);assert.equal(r.value.email_transactional,false)
 assert.equal('user_id' in r.value,false);assert.equal('notifications_enabled' in r.value,false)
 assert.equal(preferencesInput(form({opportunity_alert_mode:'daily',opportunity_radius_km:'999'})).ok,false)
})
const dataSource=(await readFile(new URL('../provider-web/src/lib/profile-data.ts',import.meta.url),'utf8')).replace("'./profile-input'",JSON.stringify(inputUrl))
const {loadPublicProfile,allPublicReviews}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(dataSource)).toString('base64'))
test('public profile lookup uses the public view and explicit safe projection',async()=>{
 const calls=[];const q={select(cols){calls.push(cols);return q},eq(key,id){calls.push(key,id);return q},maybeSingle(){return {data:{id:'person'}}}}
 const result=await loadPublicProfile({from(table){calls.push(table);return q}},'person')
 assert.equal(result.data.id,'person');assert.deepEqual(calls,['profiles_public',PUBLIC_PROFILE_COLUMNS,'id','person'])
})
test('review summary includes records beyond one page and reports fetch failures',async()=>{
 const rows=Array.from({length:501},(_,id)=>({id,rating:5}));const offsets=[]
 const q={select(){return q},eq(key,id){assert.equal(key,'reviewee_id');assert.equal(id,'person');return q},order(){return q},range(a,b){offsets.push(a);return {data:rows.slice(a,b+1)}}}
 assert.equal((await allPublicReviews({from(){return q}},'person')).length,501);assert.deepEqual(offsets,[0,500])
 q.range=()=>({error:new Error('Offline')});await assert.rejects(allPublicReviews({from(){return q}},'person'),/Offline/)
})
