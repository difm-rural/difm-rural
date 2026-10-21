import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
const url=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const categories=await readFile(new URL('../shared/categories.ts',import.meta.url),'utf8')
const source=(await readFile(new URL('../public-web/src/lib/marketplace.ts',import.meta.url),'utf8')).replace("'@shared/categories'",JSON.stringify(url(categories)))
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
