import test from 'node:test'
import assert from 'node:assert/strict'
import {nearbyPoint,nearbyDistance,filterNearby,defaultNearby,readNearby,createNearbyStore,BROWSING_LIFETIME} from '../src/lib/nearbyBrowsing.js'
const origin={latitude:-36.85,longitude:174.76}
test('mobile nearby defaults to 50 km and uses only the current member profile location',()=>{
 assert.deepEqual(defaultNearby(null),{point:null,label:'',radius:50})
 assert.deepEqual(defaultNearby({...origin,region:'Auckland'}),{point:origin,label:'Auckland',radius:50})
 assert.equal(defaultNearby({latitude:100,longitude:2}).point,null)
 for(const coords of [[null,0],['',0],[' ',0],[NaN,1],[0,181],[false,1],[{},3]])assert.equal(nearbyPoint(...coords),null)
 assert.deepEqual(nearbyPoint('-36.85','174.76'),origin)
})
test('mobile distance filter sorts nearest, supports both listing pin formats and excludes private pins only in nearby mode',()=>{
 const items=[{id:'far',latitude:-37.79,longitude:175.28},{id:'legacy',service_latitude:-36.86,service_longitude:174.76},{id:'near',...origin},{id:'private',latitude:null,longitude:null}]
 const result=filterNearby(items,{point:origin,radius:50})
 assert.deepEqual(result.items.map(i=>i.id),['near','legacy']);assert.equal(result.unlocated,1);assert.equal(result.active,true)
 assert.equal(result.items[0]._distanceKm,0)
 assert.equal(filterNearby(items,{point:origin,radius:null}).items.length,4)
 assert.equal(filterNearby(items,{point:null,radius:50}).items.length,4)
 assert.equal(filterNearby(items,{point:null,radius:50}).active,false)
 assert.ok(nearbyDistance(origin,{latitude:-37.79,longitude:175.28})>100)
 assert.equal(items[0]._distanceKm,undefined)
})
test('distance thresholds use the full calculation before rounding and can be combined with newest sorting',()=>{
 const items=[{id:'just-over',latitude:origin.latitude+50.04/111.1949266,longitude:origin.longitude},{id:'new',...origin,created_at:'2026-10-28'},{id:'old',...origin,created_at:'2026-10-01'}]
 assert.deepEqual(filterNearby(items,{point:origin,radius:50},'newest').items.map(i=>i.id),['new','old'])
 assert.equal(filterNearby(items,{point:origin,radius:100}).items.length,3)
})
test('browsing preferences are coarse, expire, stay scoped to the member and notify other screens only after a successful save',async()=>{
 const data=new Map();let fail=false,now=1000
 const storage={async getItem(k){return data.get(k)||null},async setItem(k,v){if(fail)throw new Error('offline');data.set(k,v)}}
 const store=createNearbyStore(storage,()=>now),updates=[]
 const unsubscribe=store.subscribe('paul',v=>updates.push(v))
 await store.save('paul',{point:{latitude:-36.851234,longitude:174.761234},label:'Auckland',radius:50})
 assert.deepEqual((await store.load('paul')).point,origin);assert.equal(updates.length,1)
 assert.equal(await store.load('peter'),null);assert.equal(await store.load('guest'),null)
 fail=true;await assert.rejects(store.save('paul',{point:origin,label:'Auckland',radius:null}),/offline/)
 assert.equal(updates.length,1);assert.equal((await store.load('paul')).radius,50)
 fail=false;await store.save('paul',{point:origin,label:'Auckland',radius:null});assert.equal((await store.load('paul')).radius,null)
 unsubscribe();await store.save('paul',{point:null,label:'',radius:50});assert.equal(updates.length,2)
 assert.equal((await store.load('paul')).point,null)
 now+=BROWSING_LIFETIME;assert.equal(await store.load('paul'),null)
 assert.equal(readNearby('bad'),null)
 await assert.rejects(store.save('paul',{point:origin,label:'Auckland',radius:999}),/distance/)
})
