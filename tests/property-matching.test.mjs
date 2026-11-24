import {readFileSync} from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {CATEGORIES,LISTING_CATEGORIES} from '../shared/categories.ts'
import {SUPPORT_AREAS} from '../shared/propertyNetwork.ts'
import {PROPERTY_NEEDS,propertyNeed,matchLocality,rankPropertyListings,loadPropertyMatches} from '../shared/propertyMatching.ts'

const service={area:'water',service_key:'suggested-1',name:'Water delivery',status:'needs_help'}
const need=propertyNeed(service,'Water & Drainage')
const listing=(provider_id,title,location_name,category='Water & Drainage')=>({provider_id,title,location_name,category,description:null})

test('every stock service has a canonical mapping and some search across multiple categories',()=>{
 for(const area of SUPPORT_AREAS){
  assert.deepEqual(Object.keys(PROPERTY_NEEDS[area.id]),area.services.map(service=>service.key))
  for(const service of area.services){
   const rule=PROPERTY_NEEDS[area.id][service.key],kind=rule.kind??'service'
   assert.equal(rule.categories[0],service.category,service.name)
   assert.equal(kind,service.kind??'service',service.name)
   assert.ok(rule.categories.every(category=>LISTING_CATEGORIES[kind].includes(category)))
   assert.ok(rule.terms.length)
   assert.equal(propertyNeed({area:area.id,service_key:service.key,name:service.name,status:null},'x'),rule)
  }
 }
 assert.deepEqual(need.categories,['Water & Drainage','Transport & Delivery'])
 assert.deepEqual(propertyNeed({...service,service_key:'custom-z',name:'Clean filter'},'Water & Drainage').terms,['Clean filter'])
})

test('matching requires relevant advertised work and area, then ranks relationships, locality and wider region',()=>{
 const rows=[
  listing('owner','Water delivery','Te Awamutu'),
  listing('saved-wrong','Roof repairs','Te Awamutu'),
  listing('saved-away','Water delivery','Otago'),
  listing('wrong-category','Water delivery','Te Awamutu','Land & Vegetation'),
  listing('unnamed-location','Water delivery',null),
  listing('a-regional','Water delivery','Waikato'),
  listing('b-local','Water delivery','Te Awamutu'),
  listing('b-local','Water cartage','Waikato','Transport & Delivery'),
  listing('c-worked','Water delivery','Te Awamutu'),
  listing('d-saved','Water delivery','Waikato'),
 ]
 const saved=['saved-wrong','saved-away','d-saved']
 const worked=['c-worked']
 assert.deepEqual(rankPropertyListings(rows,need,'owner','Te Awamutu','',saved,worked).map(p=>p.id),['c-worked','b-local'])
 const wider=rankPropertyListings(rows,need,'owner','Te Awamutu','Waikato',saved,worked)
 assert.deepEqual(wider.map(p=>p.id),['c-worked','d-saved','b-local','a-regional'])
 assert.deepEqual(wider.find(p=>p.id==='b-local')?.services,['Water delivery','Water cartage'])
 assert.deepEqual(rankPropertyListings(rows,need,'owner','Auckland','',saved,worked),[])
})

test('matching rejects exact addresses and coordinates and normalizes locality spelling',()=>{
 for(const value of ['123 Water Road','Water Road','-37.82, 175.28','12 Example Road, Te Awamutu',''])assert.ok(!matchLocality(value))
 const row=listing('a','Water delivery','12 Example Road, Ōhaupō 3803, New Zealand')
 const [result]=rankPropertyListings([row],need,'owner','Ohaupo','',[],[])
 assert.equal(result.reason,'Service listing advertises Ohaupo')
 assert.ok(!JSON.stringify(result).includes('Example Road'))
})

test('queries use active public offerings, projected profiles and existing review ratings only',async()=>{
 const reads=[]
 const data={services_public:[listing('a','Water delivery','Te Awamutu')],profiles_public:[{id:'a',full_name:'A'}],reviews:[{reviewee_id:'a',rating:4}]}
 const db={from:table=>({select:fields=>{
  reads.push([table,fields])
  const query={order:()=>query,in:(...args)=>{reads.push(args);return query},eq:(...args)=>{reads.push(args);return query},
   is:(...args)=>{reads.push(args);return query},range:async()=>({data:data[table],error:null})}
  return query
 }})}
 assert.deepEqual(await loadPropertyMatches(db,'owner',need,'123 Road','',[],[]),[])
 assert.equal(reads.length,0)
 const [result]=await loadPropertyMatches(db,'owner',need,'Te Awamutu','',[],['a'])
 assert.equal(result.worked,true)
 assert.equal(result.rating,'4.0')
 assert.ok(reads.some(([key,value])=>key==='kind'&&value==='service'))
 assert.ok(reads.some(([key,value])=>key==='closed_at'&&value===null))
 assert.doesNotMatch(JSON.stringify(reads),/private|latitude|longitude|address|profiles"/)
})

test('wider region is filled in only when the locality names exactly one supported region',async()=>{
 const {NZ_REGIONS,regionFromText,regionForLocality}=await import('../shared/propertyMatching.ts')
 assert.equal(NZ_REGIONS.length,16)
 assert.equal(regionFromText('Waitoki, Auckland, New Zealand'),'Auckland')
 assert.equal(regionFromText('Napier, Hawke’s Bay'),"Hawke's Bay")
 assert.equal(regionFromText('Waitoki, New Zealand'),null)
 assert.equal(regionFromText('Auckland, Waikato'),null)
 assert.equal(regionForLocality('Waitoki',[{description:'Waitoki, Auckland, New Zealand'},{description:'Waitoki Road, Waikato, New Zealand'}]),'Auckland')
 assert.equal(regionForLocality('Waitoki',[{description:'Waitoki, New Zealand'}]),null)
 assert.equal(regionForLocality('Springfield',[{description:'Springfield, Canterbury, New Zealand'},{description:'Springfield, Otago, New Zealand'}]),null)
})

test('provider search explains manual searching and scope-specific empty results',()=>{
 const screen=readFileSync(new URL('../src/screens/PropertyNetworkScreen.js',import.meta.url),'utf8')
 assert.match(screen,/Tap Search providers after changing the town or region\./)
 assert.match(screen,/Include a wider region to search further, or post a job\./)
 assert.match(screen,/Try another region, or post a job so local providers can offer\./)
 assert.match(screen,/NZ_REGIONS\.map/)
 // Compact selector: one field that opens the list, not a grid of 16 chips.
 assert.match(screen,/<RegionSelect value=\{region\}/);assert.doesNotMatch(screen,/styles\.chip,region===item/)
 assert.match(screen,/accessibilityState=\{\{selected:value===item\}\}/);assert.doesNotMatch(screen,/accessibilityLabel="Region" style=\{styles\.input\}/)
 assert.match(screen,/label="Post a job"/)
})
