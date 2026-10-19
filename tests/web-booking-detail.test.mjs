import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
import {bookingDetail,bookingDetailUrl} from './web-booking-modules.mjs'
const {selectedRate,pricingSnapshot,pricingRevision,readPricingSnapshot,bookingResponseActions,bookingNextStep,paymentCopy}=bookingDetail
const listing={id:'10000000-0000-0000-0000-000000000001',provider_id:'00000000-0000-0000-0000-000000000001',is_active:true,closed_at:null,kind:'service',pricing_type:'hourly',rate:50,min_charge:150,minimum_units:1,pricing_terms:'Delivery extra',payment_timing:'on_completion',materials:'estimate',pricing_add_ons:[{label:'Delivery',amount:40,basis:'flat'}],pricing_variants:[{label:'Specialist work',pricing_type:'hourly',rate:100,min_units:2,min_charge:300}]}
const requester='00000000-0000-0000-0000-000000000002',provider=listing.provider_id,id='20000000-0000-0000-0000-000000000001'
const form=values=>{const f=new FormData();for(const [key,value] of Object.entries(values))f.append(key,String(value));return f}
test('selected rate uses its own minimum charge and quantity, and stores the reviewed pricing',()=>{
 const copy=structuredClone(listing),snapshot=pricingSnapshot(copy,'0',1)
 assert.equal(snapshot.quantity,2);assert.equal(snapshot.base_amount,300);assert.equal(snapshot.option_label,'Specialist work');assert.equal(snapshot.min_charge,300)
 copy.pricing_add_ons[0].amount=500;copy.pricing_terms='Changed';copy.pricing_variants[0].rate=900
 assert.equal(snapshot.pricing_add_ons[0].amount,40);assert.equal(snapshot.pricing_terms,'Delivery extra');assert.equal(snapshot.rate,100)
 assert.equal(pricingSnapshot(listing,'',1).base_amount,150)
 for(const value of ['-1','99','x'])assert.throws(()=>selectedRate(listing,value))
 assert.throws(()=>pricingSnapshot({...listing,rate:null,min_charge:0},'',1))
})
test('quotes have no fabricated price and grazing capacity/cadence are retained',()=>{
 assert.equal(pricingSnapshot({...listing,pricing_type:'quote_required'},'',1).base_amount,null)
 const snapshot=pricingSnapshot({...listing,kind:'grazing',pricing_type:'per_unit',unit_label:'head/week',rate:10,max_units:20,min_charge:0},'',30)
 assert.equal(snapshot.quantity,20);assert.equal(snapshot.base_amount,200);assert.equal(snapshot.unit_label,'head/week')
 assert.match(paymentCopy({kind:'grazing',materials:'estimate'}),/duration and payment schedule/)
})
test('malformed or missing pricing snapshots fall back safely for old requests',()=>{
 const snapshot=pricingSnapshot(listing,'',1)
 assert.equal(readPricingSnapshot(null),null);assert.equal(readPricingSnapshot({version:1}),null)
 assert.equal(readPricingSnapshot({...snapshot,pricing_terms:{bad:true}}),null)
 assert.equal(readPricingSnapshot({...snapshot,pricing_add_ons:[{label:{bad:true},amount:10}]}),null)
 assert.equal(readPricingSnapshot(snapshot).base_amount,150)
 assert.notEqual(pricingRevision(listing),pricingRevision({...listing,pricing_terms:'Changed'}))
})
const booking=(patch={})=>({id,requester_id:requester,provider_id:provider,status:'pending',quote_amount:null,quote_sent_at:null,service_id:listing.id,service:{pricing_type:'quote_required'},...patch})
test('booking responses follow participant roles, saved pricing and current states',()=>{
 assert.deepEqual(bookingResponseActions(booking(),provider,'quote_required'),['quote','decline'])
 assert.deepEqual(bookingResponseActions(booking({pricing_snapshot:pricingSnapshot(listing,'0',1)}),provider,'quote_required'),['confirm','decline'])
 assert.deepEqual(bookingResponseActions(booking({status:'quote_sent',quote_amount:200}),requester,'quote_required'),['accept'])
 assert.deepEqual(bookingResponseActions(booking({status:'quote_sent'}),'outsider','quote_required'),[])
 assert.deepEqual(bookingResponseActions(booking({status:'confirmed',quote_amount:200,quote_sent_at:'2026-10-19T00:00:00Z'}),provider,'quote_required'),[])
 assert.deepEqual(bookingResponseActions(booking({status:'confirmed'}),provider,'quote_required'),['quote'])
 assert.match(bookingNextStep('pending','requester',false),/waiting/);assert.match(bookingNextStep('confirmed','requester',false,'grazing'),/ongoing/)
})
let jobSource=(await readFile(new URL('../provider-web/src/lib/job-input.ts',import.meta.url),'utf8')).replace("'@shared/categories'",JSON.stringify(new URL('../shared/categories.ts',import.meta.url).href))
let offerSource=(await readFile(new URL('../provider-web/src/lib/offer-input.ts',import.meta.url),'utf8')).replace("'@shared/offers'",JSON.stringify(new URL('../shared/offers.ts',import.meta.url).href))
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64')
let source=await readFile(new URL('../provider-web/src/app/work-actions.ts',import.meta.url),'utf8')
source=source.replace("import { redirect } from 'next/navigation'","const redirect=path=>{throw new Error('REDIRECT:'+path)}").replace("import { revalidatePath } from 'next/cache'","const revalidatePath=()=>{}").replace("import { requireProvider } from '@/lib/auth'","const requireProvider=async()=>globalThis.__bookingTestAuth").replace("'@/lib/job-input'",JSON.stringify(moduleUrl(jobSource))).replace("'@/lib/offer-input'",JSON.stringify(moduleUrl(offerSource))).replace("'@/lib/booking-detail'",JSON.stringify(bookingDetailUrl))
const {requestBooking,respondBooking}=await import(moduleUrl(source))
function client(tables,{beforeUpdate}={}){const calls=[];return {calls,from(table){let rows=[...(tables[table] || [])],patch=null;const q={select(){return q},eq(key,value){calls.push(['eq',table,key,value]);rows=rows.filter(row=>row[key]===value);return q},is(key,value){rows=rows.filter(row=>row[key]===value);return q},in(key,values){rows=rows.filter(row=>values.includes(row[key]));return q},single(){return {data:rows[0]?structuredClone(rows[0]):null,error:null}},maybeSingle(){return q.single()},insert(value){calls.push(['insert',table,value]);return {error:null}},update(value){beforeUpdate?.(tables,table);rows=[...(tables[table] || [])];patch=value;calls.push(['update',table,value]);return q},then(resolve){const result=rows.map(row=>({...row,...(patch || {})}));return Promise.resolve({data:result,error:null}).then(resolve)}};return q}}}
const requestValues={service_id:listing.id,request_id:id,quantity:1,location:'Cambridge property',schedule_type:'flexible',pricing_revision:pricingRevision(listing),variant_index:'0'}
test('request submission stores minimum-adjusted variant pricing and opens that exact request',async()=>{
 const supabase=client({services:[listing],bookings:[]});globalThis.__bookingTestAuth={supabase,user:{id:requester}}
 await assert.rejects(requestBooking({error:''},form(requestValues)),new RegExp('REDIRECT:/activity/booking/'+id+'/manage'))
 const payload=supabase.calls.find(c=>c[0]==='insert')[2];assert.equal(payload.requester_id,requester);assert.equal(payload.provider_id,provider);assert.equal(payload.quantity,2);assert.equal(payload.total_amount,300);assert.equal(payload.pricing_snapshot.option_label,'Specialist work');assert.equal(payload.status,'pending')
})
test('request submission rejects changed pricing and malformed locations/dates without inserting',async()=>{
 for(const patch of [{pricing_revision:'old-price'},{schedule_type:'specific',date:'2026-02-30'},{latitude:'91',longitude:'1'}]){
  const supabase=client({services:[listing],bookings:[]});globalThis.__bookingTestAuth={supabase,user:{id:requester}}
  assert.ok((await requestBooking({error:''},form({...requestValues,...patch}))).error);assert.equal(supabase.calls.some(c=>c[0]==='insert'),false)
 }
})
test('a retry of an already saved request returns to it without a second insert',async()=>{
 const supabase=client({bookings:[{id,requester_id:requester}]});globalThis.__bookingTestAuth={supabase,user:{id:requester}}
 await assert.rejects(requestBooking({error:''},form(requestValues)),/REDIRECT:/);assert.equal(supabase.calls.some(c=>c[0]==='insert'),false)
})
test('provider quotes update amount consistently; outsiders and direct quote confirmation are refused',async()=>{
 let supabase=client({bookings:[booking()]});globalThis.__bookingTestAuth={supabase,user:{id:provider}}
 assert.equal((await respondBooking({error:''},form({booking_id:id,intent:'quote',amount:250,notes:'Includes delivery'}))).error,'')
 const patch=supabase.calls.find(c=>c[0]==='update')[2];assert.equal(patch.quote_amount,250);assert.equal(patch.total_amount,250);assert.equal(patch.status,'quote_sent')
 for(const [userId,intent] of [[requester,'quote'],[provider,'confirm'],['outsider','decline']]){supabase=client({bookings:[booking()]});globalThis.__bookingTestAuth={supabase,user:{id:userId}};assert.ok((await respondBooking({error:''},form({booking_id:id,intent,amount:250}))).error);assert.equal(supabase.calls.some(c=>c[0]==='update'),false)}
})
test('acceptance requires the exact quote shown and guards a concurrent update',async()=>{
 const sent='2026-10-19T00:00:00Z',b=booking({status:'quote_sent',quote_amount:250,quote_sent_at:sent})
 let supabase=client({bookings:[b]});globalThis.__bookingTestAuth={supabase,user:{id:requester}}
 assert.ok((await respondBooking({error:''},form({booking_id:id,intent:'accept',quote_amount:200,quote_sent_at:sent}))).error)
 assert.equal(supabase.calls.some(c=>c[0]==='update'),false)
 supabase=client({bookings:[b]},{beforeUpdate(t){t.bookings=[{...b,quote_sent_at:'2026-10-19T01:00:00Z'}]}});globalThis.__bookingTestAuth={supabase,user:{id:requester}}
 assert.ok((await respondBooking({error:''},form({booking_id:id,intent:'accept',quote_amount:250,quote_sent_at:sent}))).error)
 assert.ok(supabase.calls.some(c=>c[0]==='eq'&&c[2]==='quote_sent_at'&&c[3]===sent))
})
let scheduleSource=await readFile(new URL('../provider-web/src/app/activity/booking-schedule-actions.ts',import.meta.url),'utf8')
scheduleSource=scheduleSource.replace("import {revalidatePath} from 'next/cache'","const revalidatePath=()=>{}").replace("import {requireProvider} from '@/lib/auth'","const requireProvider=async()=>globalThis.__bookingScheduleAuth")
const {saveBookingSchedule}=await import(moduleUrl(scheduleSource))
test('arrival windows require the confirmed provider and a valid future interval',async()=>{
 const start=new Date(Date.now()+86400000),end=new Date(start.getTime()+3600000),finish=new Date(start.getTime()+7200000),values={booking_id:id,intent:'arrival',start:start.toISOString(),end:end.toISOString(),finish:finish.toISOString()}
 for(const [userId,status,patch] of [[requester,'confirmed',{}],[provider,'pending',{}],[provider,'confirmed',{end:start.toISOString()}]]){
  const supabase=client({bookings:[booking({status,service:{kind:'service'}})]});supabase.rpc=async()=>{throw new Error('Unexpected RPC')};globalThis.__bookingScheduleAuth={supabase,user:{id:userId}}
  assert.ok((await saveBookingSchedule({error:''},form({...values,...patch}))).error)
 }
 const supabase=client({bookings:[booking({status:'confirmed',service:{kind:'service'}})]});let call;supabase.rpc=async(name,args)=>{call={name,args};return {error:null}};globalThis.__bookingScheduleAuth={supabase,user:{id:provider}}
 assert.equal((await saveBookingSchedule({error:''},form(values))).error,'');assert.equal(call.name,'set_work_arrival_window');assert.equal(call.args.p_start,start.toISOString());assert.equal(call.args.p_booking_id,id)
})

import {bookingPricingType} from '../shared/listingEstimate.ts'
test('app and web requests use the saved pricing type rather than a later live rate',()=>{
 assert.equal(bookingPricingType({pricing_snapshot:{version:1,pricing_type:'hourly'},service:{pricing_type:'quote_required'}}),'hourly')
 assert.equal(bookingPricingType({pricing_snapshot:{version:1,pricing_type:'quote_required'},service:{pricing_type:'fixed'}}),'quote_required')
 assert.equal(bookingPricingType({services:{pricing_type:'fixed'}}),'fixed')
 assert.equal(bookingPricingType({pricing_snapshot:{version:2,pricing_type:'hourly'},services:{pricing_type:'quote_required'}}),'quote_required')
})
