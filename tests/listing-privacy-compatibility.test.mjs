import test from 'node:test'
import assert from 'node:assert/strict'
import {withPrivateListingLocations} from '../shared/privateListingLocation.ts'
import {filterNearby} from '../src/lib/nearbyBrowsing.js'
import {readFileSync} from 'node:fs'
const id='listing',exact={service_id:id,location_name:'123 Private Road, Testtown',latitude:-41.12345,longitude:174.12345,service_latitude:-41.12345,service_longitude:174.12345}
function client({rows=[exact],error=null}={}) {
 const calls=[]
 return {calls,from(name) {
  assert.equal(name,'service_private_locations')
  return {select(fields) {
   assert.ok(fields.includes('service_id'))
   return {in:async(key,ids)=>{calls.push({name,key,ids});return {data:rows,error}}}
  }}
 }}
}
test('owner editor hydration uses the protected table and preserves listing identity and metadata',async()=>{
 const db=client(),coarse={id,title:'Grazing',rate:50,location_name:'Testtown',latitude:null,service_latitude:-41.1}
 const [result]=await withPrivateListingLocations(db,[coarse]);assert.equal(result.id,id);assert.equal(result.rate,50);assert.equal(result.title,'Grazing');assert.equal(result.location_name,exact.location_name);assert.equal(result.latitude,exact.latitude);assert.equal(coarse.location_name,'Testtown');assert.deepEqual(db.calls[0].ids,[id])
})
test('private location read failure or hidden/missing rows prevents editing coarse data as if exact',async()=>{
 await assert.rejects(()=>withPrivateListingLocations(client({error:new Error('denied')}),[{id}]),/denied/)
 await assert.rejects(()=>withPrivateListingLocations(client({rows:[]}),[{id}]),/unavailable/)
 const db=client();assert.deepEqual(await withPrivateListingLocations(db,[]),[]);assert.equal(db.calls.length,0)
})
test('legacy Preview distance filtering consumes coarse service-coordinate fallback without exact pins',()=>{
 const legacy={id,location_name:'Testtown',latitude:null,longitude:null,service_latitude:-41.1,service_longitude:174.1}
 const result=filterNearby([legacy],{point:{latitude:-41.1,longitude:174.1},radius:25});assert.equal(result.items.length,1);assert.equal(result.items[0]._distanceKm,0);assert.equal(legacy.latitude,null)
})
test('legacy service table and FK identity are retained; private storage has database enforcement',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261124120000_listing_location_privacy.sql',import.meta.url),'utf8')
 assert.doesNotMatch(sql,/rename\s+to|drop\s+table\s+public\.services\b/i)
 assert.match(sql,/service_private_locations enable row level security/)
 assert.match(sql,/revoke all on public\.service_private_locations from public,anon,authenticated/)
 assert.match(sql,/before insert or update on public\.services/)
})
