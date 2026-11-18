import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 filterPropertyProviders,propertyAreas,propertySpokes,propertyServiceCategory,propertyDiscoveryPath,linkedPropertyProviders,
 setPropertyArea,savePropertyService,setPropertyProvider,loadPropertyNetwork,
} from '../shared/propertyNetwork.ts'

const empty=()=>({preferences:[],services:[],links:[],people:[]})

test('six default areas display without treating untouched services as gaps',()=>{
 const areas=propertyAreas(empty())
 assert.deepEqual(areas.filter(area=>area.active).map(area=>area.id),['water','land','fencing','livestock','access','upkeep'])
 assert.deepEqual(areas.filter(area=>!area.active).map(area=>area.id),['trees','machinery'])
 assert.ok(areas.every(area=>!area.needsHelp&&!area.hasProvider))
 assert.equal(areas[0].services[0].name,'Water delivery')
})

test('hidden and re-added areas preserve custom services and multiple provider links',()=>{
 const data=empty()
 const service={area:'water',service_key:'custom-test',name:'Check the spring',status:'needs_help'}
 data.services.push(service)
 data.links.push(...['a','b'].map(provider_id=>({area:'water',service_key:service.service_key,provider_id})))
 data.people.push(...['a','b'].map(id=>({id,full_name:id.toUpperCase()})))
 data.preferences.push({area:'water',active:false})
 let water=propertyAreas(data)[0]
 assert.equal(water.active,false)
 assert.equal(water.needsHelp,true)
 assert.equal(water.hasProvider,true)
 assert.deepEqual(linkedPropertyProviders(data,service).map(person=>person.id),['a','b'])
 data.preferences[0].active=true
 water=propertyAreas(data)[0]
 assert.equal(water.active,true)
 assert.deepEqual(water.services.at(-1),service)
})

test('diagram nodes stay separate at phone widths for six through eight spokes; list includes the same areas',()=>{
 for(let count=6;count<=8;count++){
  for(const width of [288,320,430]){
   const spokes=propertySpokes(count)
   assert.equal(spokes.length,count)
   for(const [i,node] of spokes.entries()){
    assert.ok(node.x>=12&&node.x<=88&&node.y>=12&&node.y<=88)
    for(const next of spokes.slice(i+1)){
     const dx=Math.abs(node.x-next.x)*width/100,dy=Math.abs(node.y-next.y)*width/100
     assert.ok(dx>=width*.22||dy>=52)
    }
   }
  }
 }
 for(const filename of ['provider-web/src/app/property-network/property-network.tsx','src/screens/PropertyNetworkScreen.js']){
  const source=readFileSync(new URL('../'+filename,import.meta.url),'utf8')
  assert.match(source,/My Property/)
  assert.match(source,/Diagram/)
  assert.match(source,/List/)
  assert.match(source,/Find local help/)
  assert.match(source,/Invite to job|ProviderInviteAction/)
 }
})

test('gap discovery links reuse the canonical listing categories',()=>{
 const land=propertyAreas(empty())[1]
 const category=propertyServiceCategory(land,land.services[0])
 assert.equal(category,'Spraying & Pest Control')
 const available=[{id:'a',full_name:'Ava',region:'Waikato'},{id:'b',full_name:'Ben',region:'Waikato'}]
 assert.deepEqual(filterPropertyProviders(available,[available[0]],' Waikato '),[available[1]])
 assert.equal(new URL(propertyDiscoveryPath(category),'https://example.test').searchParams.get('category'),category)
})

test('network reads scope every private table to its owner and mutations reuse the guarded RPC',async()=>{
 const writes=[],filters=[]
 const db={from:table=>({
  select:()=>({eq:(column,id)=>{
   filters.push([table,column,id])
   const query={order:()=>query,range:async()=>({data:[],error:null})}
   return query
  }}),
  upsert:async(row,options)=>{writes.push([table,row,options]);return {error:null}},
 }),rpc:async(name,args)=>{writes.push([name,args]);return {error:null}}}
 assert.deepEqual(await loadPropertyNetwork(db,'owner'),empty())
 assert.equal(filters.length,3)
 assert.ok(filters.every(([,column,id])=>column==='owner_id'&&id==='owner'))
 const service={area:'water',service_key:'custom-test',name:'Spring',status:'needs_help'}
 await setPropertyArea(db,'owner','water',false)
 await savePropertyService(db,'owner',service,true)
 await setPropertyProvider(db,'owner',service,'provider',true)
 assert.deepEqual(writes[0][1],{owner_id:'owner',area:'water',active:false})
 assert.equal(writes[1][2].ignoreDuplicates,true)
 assert.deepEqual(writes[2],['link_property_network_provider',{p_area:'water',p_service:'custom-test',p_name:'Spring',p_provider:'provider'}])
})
