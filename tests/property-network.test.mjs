import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 PROPERTY_DIAGRAM_RATIO,PROPERTY_NODE_HEIGHT,PROPERTY_NODE_WIDTH,propertyAreaStatus,
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
 assert.deepEqual(propertyAreaStatus(water).map(badge=>badge.label),['2 linked','Needs support'])
 assert.deepEqual(linkedPropertyProviders(data,service).map(person=>person.id),['a','b'])
 data.preferences[0].active=true
 water=propertyAreas(data)[0]
 assert.equal(water.active,true)
 assert.deepEqual(water.services.at(-1),service)
})

test('diagram nodes stay separate at phone widths for six through eight spokes; list includes the same areas',()=>{
 for(let count=1;count<=8;count++){
  for(const width of [288,320,430]){
   const spokes=propertySpokes(count)
   assert.equal(spokes.length,count)
   for(const [i,node] of spokes.entries()){
    assert.ok(node.x>=PROPERTY_NODE_WIDTH/2&&node.x<=100-PROPERTY_NODE_WIDTH/2)
    assert.ok(Math.min(node.y,100-node.y)*width*PROPERTY_DIAGRAM_RATIO/100>=PROPERTY_NODE_HEIGHT/2)
    for(const next of spokes.slice(i+1)){
     const dx=Math.abs(node.x-next.x)*width/100,dy=Math.abs(node.y-next.y)*width*PROPERTY_DIAGRAM_RATIO/100
     assert.ok(dx>=width*PROPERTY_NODE_WIDTH/100||dy>=PROPERTY_NODE_HEIGHT)
    }
   }
  }
 }
 for(const filename of ['provider-web/src/app/property-network/property-network.tsx','src/screens/PropertyNetworkScreen.js']){
  const source=readFileSync(new URL('../'+filename,import.meta.url),'utf8')
  assert.match(source,/My Property/)
  assert.match(source,/Diagram/)
  assert.match(source,/List/)
  assert.match(source,/Grow your network/)
  assert.match(source,/Back to My Property Network/)
  assert.match(source,/type="radio"|accessibilityRole="radio"/)
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

test('My Property offers the same map-independent information in the diagram and list',()=>{
 const web=readFileSync(new URL('../provider-web/src/app/property-network/property-network.tsx',import.meta.url),'utf8')
 const native=readFileSync(new URL('../src/screens/PropertyNetworkScreen.js',import.meta.url),'utf8')
 assert.match(web,/className="property-centre" onClick=\{\(\)=>propertyInfo.current\?\.showModal\(\)\}/)
 assert.match(web,/method="dialog"/)
 assert.match(native,/onOpenProperty=\{openProperty\}/)
 assert.match(native,/label="My Property" onPress=\{openProperty\}/)
 for(const source of [web,native]){
  assert.match(source,/Map-based property setup is coming/)
  assert.doesNotMatch(source,/\/property-network\/map|navigate\('PropertyMap'\)/)
 }
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
