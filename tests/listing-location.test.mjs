import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {existingListingPin,listingLocationFields} from '../src/lib/listingLocation.js'
test('listing edits preserve current or legacy pins and save both coordinate formats consistently',()=>{
 const pin=existingListingPin({latitude:'-36.85',longitude:'174.76',service_latitude:-40,service_longitude:175})
 assert.deepEqual(pin,{latitude:-36.85,longitude:174.76})
 assert.deepEqual(existingListingPin({service_latitude:-37,service_longitude:175}),{latitude:-37,longitude:175})
 assert.deepEqual(listingLocationFields(pin),{latitude:-36.85,longitude:174.76,service_latitude:-36.85,service_longitude:174.76})
 assert.deepEqual(listingLocationFields(null),{latitude:null,longitude:null,service_latitude:null,service_longitude:null})
 assert.equal(existingListingPin({latitude:999,longitude:0}),null)
})
const mapsSource=(await readFile(new URL('../src/lib/maps.js',import.meta.url),'utf8')).replace("import { MAPS_PROXY_URL } from './constants'","const MAPS_PROXY_URL='https://maps.invalid'")
const {placesAutocomplete,placeDetails}=await import('data:text/javascript;base64,'+Buffer.from(mapsSource).toString('base64'))
test('address lookup reports service failures instead of returning a misleading empty list',async()=>{
 const original=globalThis.fetch
 try{globalThis.fetch=async()=>({ok:false,status:503});await assert.rejects(placesAutocomplete('Cambridge'),/unavailable/);await assert.rejects(placeDetails('place'),/unavailable/)}finally{globalThis.fetch=original}
})
test('address suggestions and details preserve valid zero coordinates and reject missing map positions',async()=>{
 const original=globalThis.fetch,calls=[]
 try{
  globalThis.fetch=async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>url.includes('places-autocomplete')?{suggestions:[{place_id:'town',description:'Cambridge'}]}:{latitude:0,longitude:0}}}
  assert.equal((await placesAutocomplete('Cambridge')).length,1)
  assert.deepEqual(await placeDetails('town'),{latitude:0,longitude:0})
  assert.equal(JSON.parse(calls[0][1].body).input,'Cambridge')
  globalThis.fetch=async()=>({ok:true,json:async()=>({error:'no coordinates'})})
  await assert.rejects(placeDetails('missing'),/Could not locate/)
 }finally{globalThis.fetch=original}
})
