import test from 'node:test'
import assert from 'node:assert/strict'
import {readdirSync,readFileSync} from 'node:fs'
import {
 PROPERTY_AREA_DESCRIPTIONS,PROPERTY_DIAGRAM_MIN_WIDTH,PROPERTY_DIAGRAM_RATIO,PROPERTY_HUB_SIZE,PROPERTY_NODE_HEIGHT,PROPERTY_NODE_WIDTH,SUPPORT_AREAS,propertyAreaStatus,propertyDiagramRatio,
 filterPropertyProviders,propertyAreas,propertySpokes,propertyServiceCategory,propertyServiceTarget,propertyJobCategory,propertyDiscoveryPath,linkedPropertyProviders,
 setPropertyArea,savePropertyService,setPropertyProvider,loadPropertyNetwork,discoverPropertyProviders,
 linkedPropertyContacts,propertyContactFields,propertyContactInviteText,propertyContactPhoneHref,propertyContactEmailHref,propertyContactServices,
 createPropertyContact,updatePropertyContact,deletePropertyContact,setPropertyContact,replacePropertyContact,PROPERTY_SITE_URL,
} from '../shared/propertyNetwork.ts'
import {CATEGORIES,LISTING_CATEGORIES} from '../shared/categories.ts'
import {discovery} from './web-discovery-modules.mjs'
const {discoveryFilters}=discovery

const empty=()=>({preferences:[],services:[],links:[],people:[],contacts:[],contactLinks:[]})

test('six default areas display without treating untouched services as gaps',()=>{
 const areas=propertyAreas(empty())
 assert.deepEqual(areas.filter(area=>area.active).map(area=>area.id),['water','land','fencing','livestock','access','upkeep'])
 assert.deepEqual(areas.filter(area=>!area.active).map(area=>area.id),['trees','machinery','spraying','feed','sitting'])
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
 assert.deepEqual(propertyAreaStatus(water).map(badge=>badge.label),['2 local providers','Find help'])
 assert.deepEqual(linkedPropertyProviders(data,service).map(person=>person.id),['a','b'])
 data.preferences[0].active=true
 water=propertyAreas(data)[0]
 assert.equal(water.active,true)
 assert.deepEqual(water.services.at(-1),service)
})

test('diagram nodes stay inside, clear of each other and of the hub for one through eleven areas; list includes the same areas',()=>{
 assert.equal(SUPPORT_AREAS.length,11)
 for(let count=1;count<=SUPPORT_AREAS.length;count++){
  const ratio=propertyDiagramRatio(count),spokes=propertySpokes(count)
  assert.equal(spokes.length,count)
  for(const width of [PROPERTY_DIAGRAM_MIN_WIDTH,288,320,375,430]){
   const height=width*ratio,node=width*PROPERTY_NODE_WIDTH/100,hub=width*PROPERTY_HUB_SIZE/100
   for(const [i,spot] of spokes.entries()){
    assert.ok(spot.x>=PROPERTY_NODE_WIDTH/2&&spot.x<=100-PROPERTY_NODE_WIDTH/2,count+' areas: node '+i+' fits across')
    assert.ok(Math.min(spot.y,100-spot.y)*height/100>=PROPERTY_NODE_HEIGHT/2,count+' areas: node '+i+' fits down')
    assert.ok(Math.abs(spot.x-50)*width/100>=(node+hub)/2||Math.abs(spot.y-50)*height/100>=(PROPERTY_NODE_HEIGHT+hub)/2,
     count+' areas: node '+i+' clears the hub at '+width+'px')
    for(const next of spokes.slice(i+1)){
     const dx=Math.abs(spot.x-next.x)*width/100,dy=Math.abs(spot.y-next.y)*height/100
     assert.ok(dx>=node||dy>=PROPERTY_NODE_HEIGHT,count+' areas overlap at '+width+'px')
    }
    // Spokes point from the hub at the node they draw.
    const angle=spot.angle*Math.PI/180
    assert.ok(Math.abs(50+spot.length*Math.cos(angle)-spot.x)<1e-9)
    assert.ok(Math.abs(50+spot.length*Math.sin(angle)/ratio-spot.y)<1e-9)
   }
  }
 }
 assert.equal(propertyDiagramRatio(8),PROPERTY_DIAGRAM_RATIO)
 assert.ok(propertyDiagramRatio(11)>propertyDiagramRatio(8))
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
 const spraying=propertyAreas(empty()).find(area=>area.id==='spraying')
 const category=propertyServiceCategory(spraying,spraying.services[0])
 assert.equal(spraying.services[0].name,'Weed spraying')
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
 assert.equal(filters.length,5)
 assert.deepEqual(filters.map(([table])=>table).slice(3),['property_network_contacts','property_network_contact_links'])
 assert.ok(filters.every(([,column,id])=>column==='owner_id'&&id==='owner'))
 const service={area:'water',service_key:'custom-test',name:'Spring',status:'needs_help'}
 await setPropertyArea(db,'owner','water',false)
 await savePropertyService(db,'owner',service,true)
 await setPropertyProvider(db,'owner',service,'provider',true)
 assert.deepEqual(writes[0][1],{owner_id:'owner',area:'water',active:false})
 assert.equal(writes[1][2].ignoreDuplicates,true)
 assert.deepEqual(writes[2],['link_property_network_provider',{p_area:'water',p_service:'custom-test',p_name:'Spring',p_provider:'provider'}])
})

test('every category except General Rural Help is reachable from a support area',()=>{
 const reachable=new Set(SUPPORT_AREAS.flatMap(area=>[area.category,...area.services.map(service=>service.category)]))
 for(const category of CATEGORIES.filter(category=>category!=='General Rural Help'))assert.ok(reachable.has(category),category)
 for(const area of SUPPORT_AREAS){
  assert.ok(CATEGORIES.includes(area.category),area.id)
  assert.ok(PROPERTY_AREA_DESCRIPTIONS[area.id],area.id)
  assert.ok(area.icon,area.id)
 }
})

test("each service's Find help opens its own category and listing kind",async()=>{
 const expected={
  'land/suggested-2':['Cropping, Hay & Feed','service'],
  'access/suggested-1':['Transport & Delivery','service'],
  'access/suggested-3':['Water & Drainage','service'],
  'machinery/suggested-3':['Machinery','hire'],
  'spraying/suggested-1':['Spraying & Pest Control','service'],
  'feed/suggested-1':['Cropping, Hay & Feed','service'],
  'sitting/suggested-3':['Property & House Sitting','service'],
 }
 for(const area of propertyAreas(empty())){
  for(const service of area.services){
   const definition=SUPPORT_AREAS.find(row=>row.id===area.id).services.find(row=>row.key===service.service_key)
   const {category,kind}=propertyServiceTarget(area,service)
   assert.equal(category,definition.category)
   assert.equal(kind,definition.kind??'service')
   if(expected[area.id+'/'+service.service_key])assert.deepEqual([category,kind],expected[area.id+'/'+service.service_key],area.id+' '+service.name)
   assert.ok(LISTING_CATEGORIES[kind].includes(category),service.name+' uses a '+kind+' category')
   assert.ok(CATEGORIES.includes(propertyJobCategory(area,service)),service.name+' posts a job category')
   const url=new URL(propertyDiscoveryPath(category,kind),'https://example.test')
   assert.equal(url.pathname,'/browse')
   assert.deepEqual(Object.fromEntries(url.searchParams),{kind,category})
   // The web browse page keeps the category rather than dropping it.
   assert.deepEqual([discoveryFilters(Object.fromEntries(url.searchParams)).category,discoveryFilters(Object.fromEntries(url.searchParams)).kind],[category,kind])
  }
 }
 const machinery=propertyAreas(empty()).find(area=>area.id==='machinery')
 assert.equal(propertyJobCategory(machinery,machinery.services[2]),'Machinery & Repairs')
 const custom={area:'feed',service_key:'custom-x',name:'Grain',status:null}
 assert.deepEqual(propertyServiceTarget(SUPPORT_AREAS.find(area=>area.id==='feed'),custom),{category:'Cropping, Hay & Feed',kind:'service'})
 const filters=[]
 const db={from:()=>({select:()=>{const query={eq:(...args)=>{filters.push(args);return query},is:()=>query,order:()=>query,in:()=>query,range:async()=>({data:[],error:null})};return query}})}
 await discoverPropertyProviders(db,'owner','Machinery','hire')
 assert.deepEqual(filters.filter(([column])=>column!=='is_active'),[['kind','hire'],['category','Machinery']])
})

test('saved rows keep their keys: services are keyed by id and the moved Weed spraying keeps suggested-1',()=>{
 const keys=Object.fromEntries(SUPPORT_AREAS.map(area=>[area.id,area.services.map(service=>service.key+' '+service.name)]))
 assert.deepEqual(keys.land,['suggested-2 Lime spreading','suggested-3 Pasture advice','suggested-4 Paddock mowing'])
 assert.deepEqual(keys.spraying,['suggested-1 Weed spraying','suggested-2 Pest control','suggested-3 Possum/rabbit control'])
 assert.deepEqual(keys.access,['suggested-1 Gravel delivery','suggested-2 Grading','suggested-3 Drainage and culverts'])
 assert.deepEqual(keys.feed,['suggested-1 Hay & baleage supply','suggested-2 Silage/baleage making','suggested-3 Feed delivery'])
 assert.deepEqual(keys.sitting,['suggested-1 House sitting','suggested-2 Property checks','suggested-3 Animal feeding while away'])
 for(const area of SUPPORT_AREAS){
  assert.equal(new Set(area.services.map(service=>service.key)).size,area.services.length)
  for(const service of area.services)assert.match(service.key,/^suggested-[1-4]$/)
 }
 const data=empty()
 data.services.push({area:'land',service_key:'suggested-3',name:'Pasture advice',status:'self'},
  {area:'spraying',service_key:'suggested-1',name:'Weed spraying',status:'needs_help'})
 const areas=propertyAreas(data)
 assert.equal(areas.find(area=>area.id==='land').services.find(row=>row.service_key==='suggested-3').status,'self')
 assert.equal(areas.find(area=>area.id==='spraying').needsHelp,true)
 const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(name=>name.endsWith('.sql'))
 const migration=readFileSync(new URL('../supabase/migrations/'+migrations.find(name=>name.includes('property_network_more_areas')),import.meta.url),'utf8')
 for(const area of SUPPORT_AREAS)assert.match(migration,new RegExp("'"+area.id+"'"))
 assert.match(migration,/'spraying',service_key[^;]+where area='land' and service_key='suggested-1'/)
})

test('web area icons are one Lucide icon per area with no emoji glyphs left',()=>{
 const icons=readFileSync(new URL('../provider-web/src/app/property-network/area-icon.tsx',import.meta.url),'utf8')
 const map=/PROPERTY_AREA_ICONS[^=]*=\{([^}]*)\}/.exec(icons)[1]
 const entries=Object.fromEntries(map.split(',').map(entry=>entry.trim()).filter(Boolean).map(entry=>entry.split(':')))
 assert.deepEqual(Object.keys(entries).sort(),SUPPORT_AREAS.map(area=>area.id).sort())
 assert.equal(new Set(Object.values(entries)).size,SUPPORT_AREAS.length)
 assert.equal(entries.trees,'TreeDeciduous')
 assert.equal(new Set(SUPPORT_AREAS.map(area=>area.icon)).size,SUPPORT_AREAS.length)
 for(const file of ['shared/propertyNetwork.ts','provider-web/src/app/property-network/property-network.tsx','provider-web/src/app/page.tsx'])
  assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/glyph/)
})

test('contact fields trim, lowercase email, turn blanks into null and reject what the database rejects',()=>{
 assert.deepEqual(propertyContactFields({name:'  Bob Smith ',phone:' 021  555 0101 ',email:' Bob@Example.CO.NZ ',note:'   '}),
  {value:{name:'Bob Smith',phone:'021 555 0101',email:'bob@example.co.nz',note:null},errors:{},valid:true})
 assert.deepEqual(propertyContactFields({name:'Ann'}).value,{name:'Ann',phone:null,email:null,note:null})
 assert.ok(propertyContactFields({name:'X',phone:'+64 (21) 555-0101'}).valid)
 const bad=(input,field)=>{const result=propertyContactFields({name:'X',...input});assert.equal(result.valid,false,JSON.stringify(input));assert.ok(result.errors[field],field)}
 bad({name:'   '},'name')
 bad({name:'x'.repeat(81)},'name')
 bad({phone:'call me'},'phone')
 bad({phone:'()-'},'phone')
 bad({phone:'1'.repeat(31)},'phone')
 bad({email:'not-an-email'},'email')
 bad({email:'a b@example.test'},'email')
 bad({email:'a@b'},'email')
 bad({email:'a'.repeat(250)+'@x.nz'},'email')
 bad({note:'n'.repeat(201)},'note')
 // Same rules as the table checks in the migration.
 const sql=readFileSync(new URL('../supabase/migrations/20261119022010_property_network_contacts.sql',import.meta.url),'utf8')
 for(const rule of ["phone ~ '^[0-9 +()-]+$'","email=lower(email)","'^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'","between 1 and 80","between 1 and 30","<=254","between 1 and 200"])
  assert.ok(sql.includes(rule),rule)
})

test('contacts count as linked providers and are listed per service',()=>{
 const data=empty()
 data.contacts.push({id:'c1',name:'Bob',phone:null,email:null,note:null},{id:'c2',name:'Ann',phone:null,email:null,note:null})
 data.contactLinks.push({area:'fencing',service_key:'suggested-1',contact_id:'c1'},{area:'water',service_key:'suggested-2',contact_id:'c1'})
 data.links.push({area:'fencing',service_key:'suggested-2',provider_id:'m1'})
 const fencing=propertyAreas(data).find(area=>area.id==='fencing')
 assert.equal(fencing.hasProvider,true)
 assert.equal(fencing.linkedCount,2)
 assert.deepEqual(propertyAreaStatus(fencing).map(badge=>badge.label),['2 local providers'])
 const water=propertyAreas(data).find(area=>area.id==='water')
 assert.deepEqual(propertyAreaStatus(water).map(badge=>badge.label),['1 local provider'])
 assert.deepEqual(linkedPropertyContacts(data,{area:'fencing',service_key:'suggested-1'}).map(contact=>contact.id),['c1'])
 assert.deepEqual(linkedPropertyContacts(data,{area:'fencing',service_key:'suggested-2'}),[])
 assert.equal(propertyContactServices(data,'c1').length,2)
 assert.equal(propertyAreas({preferences:[],services:[],links:[]})[0].linkedCount,0)
})

test('contact writes are owner-scoped, validated and use the guarded RPCs',async()=>{
 const writes=[]
 const chain=entry=>{const query={eq:(column,value)=>{entry.filters.push([column,value]);return query},then:resolve=>resolve({error:null})};return query}
 const db={from:table=>({
  upsert:async(row,options)=>{writes.push(['upsert',table,row,options]);return {error:null}},
  update:row=>{const entry={op:'update',table,row,filters:[]};writes.push(entry);return chain(entry)},
  delete:()=>{const entry={op:'delete',table,filters:[]};writes.push(entry);return chain(entry)},
 }),rpc:async(name,args)=>{writes.push(['rpc',name,args]);return {error:null}}}
 const service={area:'fencing',service_key:'suggested-1',name:'Fence repairs',status:null}
 await createPropertyContact(db,'owner','c1',{name:' Bob ',email:'BOB@X.NZ'})
 assert.deepEqual(writes[0],['upsert','property_network_contacts',{id:'c1',owner_id:'owner',name:'Bob',phone:null,email:'bob@x.nz',note:null},{ignoreDuplicates:true}])
 await assert.rejects(createPropertyContact(db,'owner','c2',{name:'X',phone:'call me'}))
 assert.equal(writes.length,1)
 await updatePropertyContact(db,'owner','c1',{name:'Bob',note:' Gate code 12 '})
 assert.deepEqual(writes[1].row,{name:'Bob',phone:null,email:null,note:'Gate code 12'})
 assert.deepEqual(writes[1].filters,[['owner_id','owner'],['id','c1']])
 await deletePropertyContact(db,'owner','c1')
 assert.deepEqual([writes[2].op,writes[2].table,writes[2].filters],['delete','property_network_contacts',[['owner_id','owner'],['id','c1']]])
 await setPropertyContact(db,'owner',service,'c1',true)
 assert.deepEqual(writes[3],['rpc','link_property_network_contact',{p_area:'fencing',p_service:'suggested-1',p_name:'Fence repairs',p_contact:'c1'}])
 await setPropertyContact(db,'owner',service,'c1',false)
 assert.deepEqual(writes[4].filters,[['owner_id','owner'],['area','fencing'],['service_key','suggested-1'],['contact_id','c1']])
 await replacePropertyContact(db,'c1','member')
 assert.deepEqual(writes[5],['rpc','replace_property_network_contact',{p_contact:'c1',p_provider:'member'}])
})

test('contact actions: call, email and a shareable invitation with no server send',()=>{
 assert.equal(propertyContactPhoneHref('+64 (21) 555-0101'),'tel:+64215550101')
 assert.equal(propertyContactEmailHref('bob@x.nz'),'mailto:bob@x.nz')
 const text=propertyContactInviteText({name:'Bob Smith'})
 assert.match(text,/^Hi Bob,/)
 assert.ok(text.endsWith(PROPERTY_SITE_URL))
 assert.ok(text.length<220)
 const web=readFileSync(new URL('../provider-web/src/app/property-network/property-network.tsx',import.meta.url),'utf8')
 const native=readFileSync(new URL('../src/screens/PropertyNetworkScreen.js',import.meta.url),'utf8')
 for(const source of [web,native]){
  for(const label of ['Add someone not on Rural Connections','Not on Rural Connections','Invite to Rural Connections','Replace with member','Remove link','Edit'])
   assert.ok(source.includes(label),label)
  assert.match(source,/propertyContactPhoneHref/)
  assert.match(source,/propertyContactEmailHref/)
  assert.match(source,/replacePropertyContact/)
 }
 assert.match(web,/type:'tel'/)
 assert.match(web,/type:'email'/)
 assert.match(web,/navigator\.share/)
 assert.match(web,/navigator\.clipboard\.writeText/)
 assert.match(native,/keyboardType:'phone-pad'/)
 assert.match(native,/keyboardType:'email-address',autoCapitalize:'none'/)
 assert.match(native,/Share\.share\(\{message:propertyContactInviteText/)
 // Contacts have no profile and cannot be invited to jobs.
 const contactBlock=native.slice(native.indexOf('{contacts.map(contact=>'),native.indexOf('No provider linked yet'))
 assert.ok(contactBlock.length>200)
 assert.doesNotMatch(contactBlock,/openInvite|profile\(/)
 const webBlock=web.slice(web.indexOf('{contacts.length>0&&'),web.indexOf('No provider linked yet'))
 assert.ok(webBlock.length>200)
 assert.doesNotMatch(webBlock,/ProviderInviteAction|refreshInviteChoices|providerLink/)
})
