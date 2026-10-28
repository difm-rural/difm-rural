import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
const url=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const categories=await readFile(new URL('../shared/categories.ts',import.meta.url),'utf8')
const nearbyUrl=url(await readFile(new URL('../public-web/src/lib/nearby.ts',import.meta.url),'utf8'))
const {point,distance,readGuestLocation}=await import(nearbyUrl)
const source=(await readFile(new URL('../public-web/src/lib/marketplace.ts',import.meta.url),'utf8')).replace("'@shared/categories'",JSON.stringify(url(categories))).replace("'./nearby'",JSON.stringify(nearbyUrl))
const {publicJobsQuery,publicListingsQuery,publicRows,publicResults,browseFilters,browseHref,JOB_COLUMNS,LISTING_COLUMNS}=await import(url(source))
const {consoleLink}=await import(url(await readFile(new URL('../public-web/src/lib/console-link.ts',import.meta.url),'utf8')))
test('public queries exclude private, closed and paused items and avoid private profile and job columns',()=>{
 const calls=[],q={select(v){calls.push(['select',v]);return q},eq(k,v){calls.push(['eq',k,v]);return q},is(k,v){calls.push(['is',k,v]);return q}},client={from(table){calls.push(['from',table]);return q}}
 publicJobsQuery(client);assert.deepEqual(calls[0],['from','jobs_public']);assert.ok(calls.some(c=>c.join('|')==='eq|visibility|public'));assert.ok(calls.some(c=>c.join('|')==='eq|status|open'))
 for(const key of ['location_name','location_note','latitude','longitude','area_polygon','requester_id'])assert.equal(JOB_COLUMNS.split(',').includes(key),false)
 calls.length=0;publicListingsQuery(client);assert.deepEqual(calls[0],['from','services']);assert.ok(calls.some(c=>c.join('|')==='eq|is_active|true'));assert.ok(calls.some(c=>c[0]==='is'&&c[1]==='closed_at'&&c[2]===null))
 for(const key of ['phone','address','email'])assert.equal(LISTING_COLUMNS.split(',').includes(key),false)
})
test('public search matches literal text, filters categories and paginates after searching',()=>{
 const rows=Array.from({length:45},(_,i)=>({id:String(i),title:i===44?'Water delivery':'Fence work',category:'Fencing & Gates',description:'Rural help',location_area:'Waikato'}))
 assert.equal(publicResults(rows,browseFilters({q:'Water'})).rows[0].id,'44')
 assert.equal(publicResults(rows,browseFilters({q:'%'})).count,0)
 assert.equal(publicResults(rows,browseFilters({q:'Waikato',page:'2'})).rows.length,18)
 assert.equal(publicResults(rows,browseFilters({category:'Water & Drainage'})).count,0)
 assert.equal(publicResults(rows,browseFilters({page:'999'})).page,3)
 const f=browseFilters({q:'Water & stock',kind:'grazing',page:2});assert.equal(new URL('https://example.test'+browseHref('/listings',f)).searchParams.get('q'),'Water & stock')
})
test('query failures throw rather than looking like an empty marketplace; results beyond one database page are included',async()=>{
 let fail=false;const q={select(){return q},eq(){return q},is(){return q},order(){return q},async range(start){return fail?{error:new Error('offline')}:{data:Array.from({length:start===0?500:1},(_,i)=>({id:String(start+i),title:'Job'}))}}},client={from(){return q}}
 assert.equal((await publicRows(client,'jobs')).length,501)
 fail=true;await assert.rejects(publicRows(client,'listings'),/offline/)
})
test('console handoff retains action, recipient and hash through existing sign-in and onboarding helpers',async()=>{
 const safeSource=await readFile(new URL('../provider-web/src/lib/return-path.ts',import.meta.url),'utf8')
 const firstSource=(await readFile(new URL('../provider-web/src/lib/first-time.ts',import.meta.url),'utf8')).replace("'./return-path'",JSON.stringify(url(safeSource)))
 const {setupDestination}=await import(url(firstSource))
 for(const path of ['/messages?kind=listing&id=listing&person=provider','/browse/listing/request','/jobs/job#offer','/jobs/job#questions','/jobs/new','/listings/new']){
  const link=new URL(consoleLink(path));assert.equal(link.origin,'https://difm-rural.vercel.app');assert.equal(link.pathname,'/login');assert.equal(setupDestination(link.searchParams.get('next')),path)
 }
 for(const unsafe of ['https://evil.test','//evil.test','/\\evil.test'])assert.equal(new URL(consoleLink(unsafe)).searchParams.get('next'),'/')
})

test('nearby defaults to 50 km, validates coordinates and expires browsing preferences',()=>{
 assert.deepEqual(readGuestLocation(undefined),{point:null,label:'',radius:50})
 const saved={latitude:-36.85,longitude:174.76,label:'Auckland',radius:25,expires:2000}
 assert.deepEqual(readGuestLocation(JSON.stringify(saved),1000),{point:{latitude:-36.85,longitude:174.76},label:'Auckland',radius:25})
 assert.equal(readGuestLocation(JSON.stringify(saved),2000).point,null)
 assert.equal(readGuestLocation(JSON.stringify({...saved,radius:null}),1000).radius,null)
 assert.equal(readGuestLocation(JSON.stringify({...saved,radius:999}),1000).radius,50)
 for(const p of [[null,0],[NaN,1],[91,0],[0,181],['-36',174]])assert.equal(point(...p),null)
 assert.equal(distance(point(-36.85,174.76),point(-36.85,174.76)),0)
 assert.ok(distance(point(-36.85,174.76),point(-37.79,175.28))>100)
})
test('nearby filtering happens before pagination and sorts nearest first without inventing distances for private pins',()=>{
 const rows=Array.from({length:40},(_,i)=>({id:String(i),title:'Fencing',distance:40-i}))
 rows.push({id:'private',title:'Fencing',distance:null})
 let result=publicResults(rows,browseFilters({q:'Fencing'}),25)
 assert.equal(result.count,25);assert.equal(result.rows[0].distance,1);assert.equal(result.rows.length,18);assert.equal(result.unlocated,1)
 result=publicResults(rows,browseFilters({q:'Fencing',page:'2'}),25);assert.equal(result.rows.length,7)
 assert.equal(publicResults(rows,browseFilters({}),null).count,41)
 assert.equal(publicResults(rows,browseFilters({}),10).count,10)
 assert.equal(publicResults([{title:'Fencing',distance:100}],browseFilters({}),50).count,0)
})
test('distance reads use the public job view and return only calculated distances, never coordinates',async()=>{
 const calls=[];let selected=''
 const q={select(v){selected=v;calls.push(v);return q},eq(){return q},is(){return q},order(){return q},async range(){return {data:selected==='id,latitude,longitude'?[{id:'near',latitude:-36.85,longitude:174.76},{id:'private',latitude:null,longitude:null}]:[{id:'near',title:'Fencing'},{id:'private',title:'Fencing'}]}}}
 const rows=await publicRows({from(table){assert.equal(table,'jobs_public');return q}},'jobs',point(-36.85,174.76))
 assert.equal(rows[0].distance,0);assert.equal(rows[1].distance,null)
 for(const row of rows){assert.equal('latitude' in row,false);assert.equal('longitude' in row,false)}
 assert.ok(calls.includes('id,latitude,longitude'))
})

let savedCookie,storageFailure=false
const jar={get(){return savedCookie?{value:savedCookie.value}:undefined},set(name,value,options){if(storageFailure)throw new Error('unavailable');savedCookie={name,value,options}},delete(){if(storageFailure)throw new Error('unavailable');savedCookie=undefined}}
globalThis.__guestLocationTest={cookies:async()=>jar,guestLocation:async()=>readGuestLocation(savedCookie?.value),LOCATION_COOKIE:'rural-public-location'}
let actionsSource=await readFile(new URL('../public-web/src/app/location-actions.ts',import.meta.url),'utf8')
actionsSource=actionsSource.replace("import {cookies} from 'next/headers'","const {cookies}=globalThis.__guestLocationTest").replace("import {guestLocation,LOCATION_COOKIE} from '@/lib/guest-location'","const {guestLocation,LOCATION_COOKIE}=globalThis.__guestLocationTest").replace("'@/lib/nearby'",JSON.stringify(nearbyUrl))
const {chooseGuestLocation,chooseGuestRadius,forgetGuestLocation}=await import(url(actionsSource))
test('location actions remember coarse coordinates privately, retain them across radius changes and handle failed saves',async()=>{
 assert.equal((await chooseGuestLocation(91,174,'Invalid')).error.length>0,true);assert.equal(savedCookie,undefined)
 assert.equal((await chooseGuestLocation(-36.851234,174.761234,'Auckland')).error,'')
 let saved=JSON.parse(savedCookie.value);assert.equal(saved.latitude,-36.85);assert.equal(saved.longitude,174.76);assert.equal(saved.radius,50)
 assert.equal(savedCookie.options.httpOnly,true);assert.equal(savedCookie.options.sameSite,'lax');assert.equal(savedCookie.options.maxAge,21600)
 assert.equal((await chooseGuestRadius(null)).error,'');assert.equal(JSON.parse(savedCookie.value).radius,null)
 assert.equal(JSON.parse(savedCookie.value).latitude,-36.85)
 assert.equal((await chooseGuestRadius(25)).error,'');assert.equal(JSON.parse(savedCookie.value).radius,25)
 assert.ok((await chooseGuestRadius(999)).error)
 storageFailure=true;assert.ok((await chooseGuestRadius(10)).error);assert.equal(JSON.parse(savedCookie.value).radius,25)
 storageFailure=false;assert.equal((await forgetGuestLocation()).error,'');assert.equal(savedCookie,undefined)
})
