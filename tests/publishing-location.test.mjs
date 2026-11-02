import assert from 'node:assert/strict'
import test from 'node:test'
import {publishingLocationWarning,PUBLISHING_DISTANCE_WARNING_KM} from '../shared/publishingLocation.ts'
const waitoki={latitude:-36.638,longitude:174.533,region:'Waitoki'}
const whitecliffs={latitude:-43.4617464,longitude:171.8935804,area:'Whitecliffs, New Zealand',kind:'listing'}
test('warns for the distant Whitecliffs listing without blocking legitimate distant work',async()=>{
 const result=await publishingLocationWarning(whitecliffs,waitoki,async()=>{throw Error('A valid pin needs no lookup')})
 assert.ok(result.distanceKm>750&&result.distanceKm<850)
 assert.match(result.message,/listing.*km from your saved profile location \(Waitoki\)/)
 assert.match(result.message,/People searching near your saved location may not find it/)
 assert.equal(PUBLISHING_DISTANCE_WARNING_KM,200)
})
test('town-only profiles and unpinned jobs use their selected areas',async()=>{
 const calls=[]
 const result=await publishingLocationWarning({area:'Whitecliffs',kind:'job'},{region:'Waitoki'},async area=>{
 calls.push(area);return area==='Waitoki'?waitoki:whitecliffs
 })
 assert.deepEqual(calls,['Waitoki','Whitecliffs'])
 assert.match(result.message,/This job/)
})
test('nearby work does not warn and pins take precedence over free text',async()=>{
 assert.equal(await publishingLocationWarning({latitude:waitoki.latitude,longitude:waitoki.longitude,area:'Whitecliffs',kind:'job'},waitoki,async()=>{throw Error('Unexpected lookup')}),null)
})
test('missing or invalid locations never invent a distance',async()=>{
 assert.equal(await publishingLocationWarning(whitecliffs,null,async()=>null),null)
 assert.equal(await publishingLocationWarning(whitecliffs,{latitude:'',longitude:'',region:''},async()=>null),null)
 assert.equal(await publishingLocationWarning({latitude:999,longitude:0,area:'Unknown',kind:'job'},waitoki,async()=>null),null)
 assert.equal(await publishingLocationWarning({kind:'listing'},waitoki,async()=>null),null)
})
test('a changed destination is checked afresh and numeric strings are accepted',async()=>{
 const check=location=>publishingLocationWarning(location,{latitude:String(waitoki.latitude),longitude:String(waitoki.longitude),region:'Waitoki'},async()=>null)
 assert.ok(await check(whitecliffs))
 assert.equal(await check({...waitoki,kind:'listing'}),null)
})
