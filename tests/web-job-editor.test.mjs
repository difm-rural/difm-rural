import {bookingDetailUrl} from './web-booking-modules.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
let source=(await readFile(new URL('../provider-web/src/lib/job-input.ts',import.meta.url),'utf8')).replace("'@shared/categories'",JSON.stringify(new URL('../shared/categories.ts',import.meta.url).href))
const helperUrl='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const {jobInput,repeatSeed,jobOwnerActions}=await import(helperUrl)
const me='00000000-0000-0000-0000-000000000001',id='00000000-0000-0000-0000-000000000002'
const form=values=>{const f=new FormData();for(const [k,v] of Object.entries(values))for(const value of Array.isArray(v)?v:[v])f.append(k,value);return f}
const valid={title:'Fence repair',description:'Repair damaged posts',category:'Fencing & Gates',area:'Waikato',price_type:'open',schedule_type:'flexible',materials_type:'none',hide_exact_location:'on'}
// Use the actual taxonomy, rather than making the validation test depend on one display label.
const {CATEGORIES}=await import(new URL('../shared/categories.ts',import.meta.url).href);valid.category=CATEGORIES[0]
const context={userId:me,jobId:id,baseUrl:'https://example.com'}
test('job payload whitelists authored fields and makes private location explicit',()=>{
 const r=jobInput(form({...valid,requester_id:'other',status:'completed',visibility:'invite_only',location:'Private address',latitude:'-37.4',longitude:'175.3'}),context)
 assert.equal(r.ok,true);assert.equal(r.value.hide_exact_location,true);assert.equal(r.value.location_name,'Private address');assert.equal(r.value.latitude,-37.4)
 for(const key of ['id','requester_id','status','visibility','recurrence_frequency','repeated_from_job_id'])assert.equal(key in r.value,false)
 assert.equal(jobInput(form({...valid,hide_exact_location:'off'}),context).value.hide_exact_location,false)
 assert.equal(jobInput(form(valid),context).value.location_name,null)
})
test('dates, budgets, coordinates, photos and access options reject invalid input',()=>{
 for(const patch of [{schedule_type:'range',date_from:'2026-10-22',date_to:'2026-10-20'},{schedule_type:'specific',scheduled_date:'2026-02-30'},{price_type:'fixed',price:'Infinity'},{latitude:'1'},{latitude:'91',longitude:'0'},{access_conditions:['invented']},{photos:['javascript:alert(1)']},{photos:['https://example.com/storage/v1/object/public/job-photos/'+id+'/other/a.jpg']},{materials_type:'constructor'},{schedule_type:'toString'}])assert.equal(jobInput(form({...valid,...patch}),context).ok,false,JSON.stringify(patch))
 const r=jobInput(form({...valid,schedule_type:'range',date_from:'2026-10-20',date_to:'2026-10-22',price_type:'fixed',price:'150',photos:['https://example.com/storage/v1/object/public/job-photos/'+id+'/'+me+'/a.jpg']}),context)
 assert.equal(r.ok,true);assert.equal(r.value.date_to,'2026-10-22');assert.equal(r.value.scheduled_date,null);assert.equal(r.value.price,150)
 assert.equal(jobInput(form({...valid,photos:['https://old.example/photo.jpg']}),{...context,existingPhotos:['https://old.example/photo.jpg']}).ok,true)
})
test('repeating clears all calendar dates without mutating the source',()=>{
 const seed={id,status:'completed',title:'Old job',scheduled_date:'2020-01-01',date_from:'2020-01-01',date_to:'2020-01-02',photos:['a'],schedule_type:'range'}
 const r=repeatSeed(seed);assert.equal(r.schedule_type,'flexible');for(const key of ['scheduled_date','date_from','date_to'])assert.equal(r[key],null)
 assert.equal(seed.scheduled_date,'2020-01-01');assert.deepEqual(r.photos,['a'])
})
test('owner controls prevent editing active work and deletion while offers exist',()=>{
 assert.deepEqual(jobOwnerActions('open',0),{edit:true,repeat:false,delete:true})
 assert.equal(jobOwnerActions('open',1).delete,false)
 for(const state of ['accepted','in_progress','awaiting_completion'])assert.deepEqual(jobOwnerActions(state,0),{edit:false,repeat:false,delete:false})
 assert.deepEqual(jobOwnerActions('completed',1),{edit:false,repeat:true,delete:false});assert.deepEqual(jobOwnerActions('cancelled',1),{edit:false,repeat:true,delete:true})
})
const offerSource=(await readFile(new URL('../provider-web/src/lib/offer-input.ts',import.meta.url),'utf8')).replace("'@shared/offers'",JSON.stringify(new URL('../shared/offers.ts',import.meta.url).href))
const offerUrl='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(offerSource)).toString('base64')
const {offerInput}=await import(offerUrl)
test('itemised offers calculate their amount, retain pricing terms and reject inconsistent inputs',()=>{
 const values={item_label:['Labour','Travel'],item_amount:['120','30'],pricing_type:'hourly',message:'',materials:'estimate',available_from:'2026-10-22',estimated_duration:'One day'}
 const r=offerInput(form(values),true);assert.equal(r.ok,true);assert.equal(r.value.amount,150);assert.equal(r.value.pricing_type,'hourly');assert.equal(r.value.materials,'estimate');assert.equal(r.value.available_from,'2026-10-22')
 assert.equal(offerInput(form({...values,item_amount:['-1','20']}),true).ok,false)
 assert.equal(offerInput(form({...values,available_from:'2026-02-30'}),true).ok,false)
 assert.equal(offerInput(form({...values,item_label:['Only one']}),true).ok,false)
 assert.equal(offerInput(form(values),false).value.materials,null)
})
let actionSource=await readFile(new URL('../provider-web/src/app/work-actions.ts',import.meta.url),'utf8')
actionSource=actionSource.replace("import { redirect } from 'next/navigation'","const redirect=(path)=>{throw new Error('REDIRECT:'+path)}").replace("import { revalidatePath } from 'next/cache'","const revalidatePath=()=>{}").replace("import { requireProvider } from '@/lib/auth'","const requireProvider=async()=>globalThis.__jobTestAuth").replace("'@/lib/job-input'",JSON.stringify(helperUrl)).replace("'@/lib/offer-input'",JSON.stringify(offerUrl)).replace("'@/lib/booking-detail'",JSON.stringify(bookingDetailUrl))
const {postJob,editJob,changeOffer,removeJob}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(actionSource)).toString('base64'))
function client(tables){const calls=[];return {calls,from(table){let row=tables[table];const q={select(){return q},eq(key,value){calls.push([table,key,value]);if(row&&key in row&&row[key]!==value)row=null;return q},maybeSingle(){return {data:row,error:null}},single(){return {data:row,error:null}},update(patch){calls.push(['update',table,patch]);return q},insert(patch){calls.push(['insert',table,patch]);return {error:null}},then(resolve){return Promise.resolve({data:row?[row]:[],count:tables.offerCount ?? 0,error:null}).then(resolve)}};return q},async rpc(name,args){calls.push(['rpc',name,args]);return {error:null}}}}
test('editing derives ownership from sign-in and refuses accepted or foreign jobs',async()=>{
 for(const row of [{id,requester_id:'someone-else',status:'open'},{id,requester_id:me,status:'accepted'}]){
  const supabase=client({jobs:row});globalThis.__jobTestAuth={supabase,user:{id:me}}
  assert.ok((await editJob({error:''},form({...valid,job_id:id}))).error);assert.equal(supabase.calls.some(c=>c[0]==='update'),false)
 }
})
test('post retries reuse the same owned job id without inserting a duplicate',async()=>{
 const supabase=client({jobs:{id,requester_id:me}});globalThis.__jobTestAuth={supabase,user:{id:me}}
 const result=await postJob({error:''},form({...valid,job_id:id}));assert.equal(result.jobId,id);assert.equal(supabase.calls.some(c=>c[0]==='insert'),false)
})
test('offer changes require a pending owned offer and open job before invoking guarded RPC',async()=>{
 let supabase=client({bids:{id,job_id:id,provider_id:'other',status:'pending'},jobs_public:{status:'open'}});globalThis.__jobTestAuth={supabase,user:{id:me}}
 assert.ok((await changeOffer({error:''},form({offer_id:id,intent:'withdraw',confirmed:'on'}))).error);assert.equal(supabase.calls.some(c=>c[0]==='rpc'),false)
 supabase=client({bids:{id,job_id:id,provider_id:me,status:'pending'},jobs_public:{status:'open'}});globalThis.__jobTestAuth={supabase,user:{id:me}}
 assert.equal((await changeOffer({error:''},form({offer_id:id,intent:'edit',item_label:['Labour'],item_amount:['200'],pricing_type:'fixed',message:'Updated offer'}))).error,'');assert.equal(supabase.calls.find(c=>c[0]==='rpc')[1],'update_pending_job_offer_details')
})
test('deletion requires explicit confirmation and refuses open jobs with offers',async()=>{
 const supabase=client({jobs:{id,status:'open',requester_id:me},offerCount:1});globalThis.__jobTestAuth={supabase,user:{id:me}}
 assert.ok((await removeJob({error:''},form({job_id:id,confirmed:'on'}))).error);assert.equal(supabase.calls.some(c=>c[0]==='rpc'),false)
 assert.ok((await removeJob({error:''},form({job_id:id}))).error)
})

import {safeReturnPath} from '../provider-web/src/lib/return-path.ts'
test('shared job links survive sign-in and external redirects are rejected',()=>{
 assert.equal(safeReturnPath('/jobs/'+id),'/jobs/'+id)
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/login','/auth/callback','/\n/evil.example',null])assert.equal(safeReturnPath(value),'/')
 assert.equal(safeReturnPath('/jobs/'+id+'?ref=share'),'/jobs/'+id+'?ref=share')
})
