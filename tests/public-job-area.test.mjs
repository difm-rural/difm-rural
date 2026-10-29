import assert from 'node:assert/strict'
import test from 'node:test'
import {addPublicJobAreas,createPublicAreaCache,lookupPublicArea} from '../shared/publicJobArea.ts'
import {filterNearby} from '../src/lib/nearbyBrowsing.js'
import {discovery} from './web-discovery-modules.mjs'
const origin={latitude:-36.62,longitude:174.5},town={latitude:-36.637,longitude:174.539}
const job={id:'spray',title:'Spray paddocks for carrot weed',location_area:'Waitoki 0871',hide_exact_location:true,latitude:null,longitude:null,location_name:null,location_note:null,area_polygon:null,created_at:'2026-10-29T00:00:00Z'}
test('a nearby private spray job matches using its public town while exact-location fields stay masked',async()=>{
 const calls=[],rows=await addPublicJobAreas([job],async area=>{calls.push(area);return town})
 assert.deepEqual(calls,['Waitoki 0871']);assert.equal(rows[0].discovery_location_approximate,true)
 for(const key of ['latitude','longitude','location_name','location_note','area_polygon'])assert.equal(rows[0][key],null)
 assert.equal(job.discovery_latitude,undefined)
 const mobile=filterNearby(rows,{point:origin,radius:50});assert.equal(mobile.items[0].id,'spray')
 const web=discovery.discover(rows,discovery.discoveryFilters({radius:'50',sort:'nearest'}),origin);assert.equal(web.rows[0].id,'spray')
 assert.equal(filterNearby(rows,{point:{latitude:-43.5,longitude:172.6},radius:50}).items.length,0)
})
test('public pin is preferred and neither a hidden street address nor an absent public area is geocoded',async()=>{
 const calls=[]
 const rows=await addPublicJobAreas([{...job,latitude:origin.latitude,longitude:origin.longitude},{...job,id:'no-area',location_area:null,location_name:'PRIVATE STREET ADDRESS'}],async area=>{calls.push(area);return town})
 assert.deepEqual(calls,[]);assert.equal(rows[0].discovery_latitude,undefined);assert.equal(rows[1].discovery_latitude,undefined)
 assert.equal(filterNearby(rows,{point:origin,radius:null}).items.length,2)
})
test('public town lookups are deduplicated, cached for a day and retried after failures',async()=>{
 let now=1000,calls=0
 const resolve=createPublicAreaCache(async()=>{calls++;return town},()=>now)
 await Promise.all([resolve('Near Waitoki 0871'),resolve('waitoki 0871')]);assert.equal(calls,1)
 await resolve('Waitoki 0871');assert.equal(calls,1)
 now+=24*3600000;await resolve('Waitoki 0871');assert.equal(calls,2)
 let fail=true;const retry=createPublicAreaCache(async()=>{if(fail)throw new Error('offline');return town})
 assert.equal(await retry('Waitoki'),null);fail=false;assert.deepEqual(await retry('Waitoki'),town)
})
test('maps lookup sends only the supplied public area and fails without inventing a pin',async()=>{
 const requests=[]
 const request=async(url,options)=>{requests.push([url,options]);return {ok:true,json:async()=>url.includes('autocomplete')?{suggestions:[{place_id:'public-town'}]}:town}}
 assert.deepEqual(await lookupPublicArea('https://maps.invalid','Waitoki 0871',request),town)
 assert.equal(JSON.parse(requests[0][1].body).input,'Waitoki 0871, New Zealand')
 assert.equal(requests[1][0],'https://maps.invalid/place-details?place_id=public-town')
 assert.equal(await lookupPublicArea('https://maps.invalid','Unknown',async()=>({ok:true,json:async()=>({suggestions:[]})})),null)
 await assert.rejects(lookupPublicArea('https://maps.invalid','Waitoki',async()=>({ok:false})),/unavailable/)
})
