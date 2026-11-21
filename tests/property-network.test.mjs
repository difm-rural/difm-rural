import test from 'node:test'
import assert from 'node:assert/strict'
import {readdirSync,readFileSync} from 'node:fs'
import {
 PROPERTY_AREA_DESCRIPTIONS,PROPERTY_DIAGRAM_MIN_WIDTH,PROPERTY_DIAGRAM_RATIO,PROPERTY_HUB_SIZE,PROPERTY_NODE_HEIGHT,PROPERTY_NODE_WIDTH,SUPPORT_AREAS,propertyAreaStatus,propertyDiagramRatio,
 filterPropertyProviders,propertyAreas,propertySpokes,propertyServiceCategory,propertyServiceTarget,propertyJobCategory,propertyDiscoveryPath,linkedPropertyProviders,
 setPropertyArea,savePropertyService,setPropertyProvider,loadPropertyNetwork,discoverPropertyProviders,
 linkedPropertyContacts,propertyContactFields,propertyContactInviteText,propertyContactPhoneHref,propertyContactEmailHref,propertyContactServices,
 createPropertyContact,updatePropertyContact,deletePropertyContact,setPropertyContact,replacePropertyContact,PROPERTY_SITE_URL,
 propertyServiceChoice,propertyChoiceStatus,propertyWhoMeStatus,propertyStatusAfterUnlink,propertySetupStarted,savePropertyAreas,
 propertyBulkServices,savePropertyServices,propertyAreaProgress,propertyAreaWho,propertyGaps,PROPERTY_AREA_DESCRIPTIONS as HINTS,
 PROPERTY_CATEGORY_AREAS,propertyWorkTarget,propertySuggestion,propertySuggestionText,acceptPropertySuggestion,dismissPropertySuggestion,propertyNetworkHomeLines,
} from '../shared/propertyNetwork.ts'
import {CATEGORIES,LISTING_CATEGORIES} from '../shared/categories.ts'
import {discovery} from './web-discovery-modules.mjs'
const {discoveryFilters}=discovery

const empty=()=>({preferences:[],services:[],links:[],people:[],contacts:[],contactLinks:[]})

test('a member with no saved areas has none active and sees the first-visit setup',()=>{
 const areas=propertyAreas(empty())
 assert.deepEqual(areas.filter(area=>area.active),[])
 assert.equal(propertySetupStarted(empty()),false)
 assert.equal(propertySetupStarted({preferences:[{area:'water',active:false}]}),true)
 assert.ok(areas.every(area=>!area.needsHelp&&!area.hasProvider))
 assert.deepEqual(areas.map(area=>area.label),['Water','Paddocks','Fences & gates','Animals','Driveway & tracks','Sheds & buildings',
  'Trees & firewood','Machinery','Weeds & pests','Hay & feed','Time away'])
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
 assert.deepEqual(propertyAreaStatus(water).map(badge=>badge.label),['2 local providers','1 needs help'])
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
  assert.doesNotMatch(source,/Grow your network|type="radio"|accessibilityRole="radio"|PROPERTY_SERVICE_STATES/)
  for(const text of ["What's on your property?",'Skip for now','Set up my network (','Needs help (','Nothing needs help right now',
   'Your property','+ Add another part of your property',"Update what's on your property",'All sorted','None of this applies',
   'Who does it? (optional)','A provider…','Someone not on RC','+ Add something else','from my property','Post a job'])
   assert.ok(source.includes(text)||source.includes(text.replaceAll("'",'&apos;')),filename+': '+text)
  assert.match(source,/Back to My Property Network/)
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

test('My Property opens the map from diagram and list on both clients',()=>{
 const web=readFileSync(new URL('../provider-web/src/app/property-network/property-network.tsx',import.meta.url),'utf8')
 const native=readFileSync(new URL('../src/screens/PropertyNetworkScreen.js',import.meta.url),'utf8')
 assert.match(web,/className="property-centre" href="\/property-network\/map"/)
 assert.match(web,/<li><Link href="\/property-network\/map" className="property-map-link">My Property map/)
 assert.match(native,/onOpenProperty=\{openProperty\}/)
 assert.match(native,/label="My Property" icon="map-outline" onPress=\{openProperty\}/)
 assert.match(native,/navigate\('PropertyMap'\)/)
 for(const source of [web,native])assert.doesNotMatch(source,/Map-based property setup is coming/)
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
 const contactBlock=native.slice(native.indexOf('{contacts.map(contact=><View key={contact.id} style={styles.linked}>'),native.indexOf("{choice==='help'&&"))
 assert.ok(contactBlock.length>200)
 assert.doesNotMatch(contactBlock,/openInvite|profile\(/)
 const webBlock=web.slice(web.indexOf('{contacts.length>0&&'),web.indexOf("{choice==='help'&&"))
 assert.ok(webBlock.length>200)
 assert.doesNotMatch(webBlock,/ProviderInviteAction|refreshInviteChoices|providerLink/)
})

test('statuses map to Sorted, Need help and N/A and back',()=>{
 for(const [status,choice] of [['sorted','sorted'],['self','sorted'],['has_provider','sorted'],['needs_help','help'],['irrelevant','na'],[null,null],[undefined,null]])
  assert.equal(propertyServiceChoice(status),choice,String(status))
 // One tap saves; tapping the current choice clears it.
 assert.equal(propertyChoiceStatus(null,'sorted'),'sorted')
 assert.equal(propertyChoiceStatus(null,'help'),'needs_help')
 assert.equal(propertyChoiceStatus(null,'na'),'irrelevant')
 // Plain Sorted with nobody assigned clears; Sorted with Me, a provider or a
 // contact keeps its status (and links), so the tap changes nothing.
 assert.equal(propertyChoiceStatus('sorted','sorted'),null)
 assert.equal(propertyChoiceStatus('sorted','sorted',0),null)
 assert.equal(propertyChoiceStatus('self','sorted'),'self')
 assert.equal(propertyChoiceStatus('self','sorted',2),'self')
 assert.equal(propertyChoiceStatus('has_provider','sorted',1),'has_provider')
 assert.equal(propertyChoiceStatus('has_provider','sorted'),'has_provider')
 // Links left over from an earlier status (provider → Needs help → Sorted) still count.
 assert.equal(propertyChoiceStatus('sorted','sorted',1),'sorted')
 // Other choices still switch away, and Help/N/A still toggle off, assigned or not.
 assert.equal(propertyChoiceStatus('has_provider','na',1),'irrelevant')
 assert.equal(propertyChoiceStatus('needs_help','help',1),null)
 for(const file of ['src/screens/PropertyNetworkScreen.js','provider-web/src/app/property-network/property-network.tsx']){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8')
  assert.match(source,/tapChoice\(service,value,covered\)/,file+' passes the linked count')
  assert.match(source,/if\(status===service\.status\)return/,file+' skips a no-op save')
 }
 assert.equal(propertyChoiceStatus('needs_help','help'),null)
 assert.equal(propertyChoiceStatus('irrelevant','na'),null)
 assert.equal(propertyChoiceStatus('self','help'),'needs_help')
 assert.equal(propertyChoiceStatus('needs_help','sorted'),'sorted')
 // Who does it? Me toggles self; removing the last link goes back to plain sorted.
 assert.equal(propertyWhoMeStatus('sorted'),'self')
 assert.equal(propertyWhoMeStatus('has_provider'),'self')
 assert.equal(propertyWhoMeStatus('self'),'sorted')
 assert.equal(propertyStatusAfterUnlink('has_provider',0),'sorted')
 assert.equal(propertyStatusAfterUnlink('has_provider',1),'has_provider')
 assert.equal(propertyStatusAfterUnlink('needs_help',0),'needs_help')
 // The database accepts the new status.
 const sql=readFileSync(new URL('../supabase/migrations/20261120074030_property_network_sorted_status.sql',import.meta.url),'utf8')
 assert.match(sql,/check \(status in \('sorted','has_provider','self','needs_help','irrelevant'\)\)/)
 for(const area of SUPPORT_AREAS)assert.ok(HINTS[area.id],area.id)
})

test('setup saves every area in one call with only the ticked ones active',async()=>{
 const writes=[]
 const db={from:table=>({upsert:async(rows,options)=>{writes.push([table,rows,options]);return {error:null}}})}
 await savePropertyAreas(db,'owner',['water','spraying','sitting'])
 assert.equal(writes.length,1)
 const [table,rows]=writes[0]
 assert.equal(table,'property_network_areas')
 assert.equal(rows.length,SUPPORT_AREAS.length)
 assert.ok(rows.every(row=>row.owner_id==='owner'))
 assert.deepEqual(rows.filter(row=>row.active).map(row=>row.area),['water','spraying','sitting'])
 // Once saved, the overview shows those areas and setup is done.
 const areas=propertyAreas({preferences:rows,services:[],links:[]})
 assert.deepEqual(areas.filter(area=>area.active).map(area=>area.id),['water','spraying','sitting'])
 assert.equal(propertySetupStarted({preferences:rows}),true)
 await assert.rejects(savePropertyAreas({from:()=>({upsert:async()=>({error:new Error('offline')})})},'owner',['water']))
})

test('All sorted and None of this applies only fill unanswered services',async()=>{
 const services=[
  {area:'fencing',service_key:'suggested-1',name:'Fence repairs',status:'needs_help'},
  {area:'fencing',service_key:'suggested-2',name:'New fencing',status:null},
  {area:'fencing',service_key:'suggested-3',name:'Gates',status:'self'},
  {area:'fencing',service_key:'suggested-4',name:'Electric fencing',status:null},
 ]
 const {updates,kept}=propertyBulkServices(services,'sorted')
 assert.equal(kept,2)
 assert.deepEqual(updates.map(service=>[service.service_key,service.status]),[['suggested-2','sorted'],['suggested-4','sorted']])
 assert.equal(services[0].status,'needs_help')
 assert.deepEqual(propertyBulkServices(services.map(service=>({...service,status:null})),'irrelevant').kept,0)
 assert.deepEqual(propertyBulkServices([services[0]],'irrelevant'),{updates:[],kept:1})
 const writes=[]
 const db={from:table=>({upsert:async(rows)=>{writes.push([table,rows]);return {error:null}}})}
 await savePropertyServices(db,'owner',updates)
 assert.deepEqual(writes,[['property_network_services',updates.map(service=>({...service,owner_id:'owner'}))]])
 await savePropertyServices(db,'owner',[])
 assert.equal(writes.length,1)
 // Both clients ask before a bulk change only when some services are already answered.
 const web=readFileSync(new URL('../provider-web/src/app/property-network/property-network.tsx',import.meta.url),'utf8')
 const native=readFileSync(new URL('../src/screens/PropertyNetworkScreen.js',import.meta.url),'utf8')
 assert.match(web,/if\(kept&&!window\.confirm\(/)
 assert.match(native,/if\(!kept\)return run\(\)/)
})

test('the gaps list and area cards count what needs help, what is sorted and what is left',()=>{
 const data=empty()
 data.preferences.push({area:'water',active:true},{area:'fencing',active:true},{area:'trees',active:false},{area:'livestock',active:true})
 data.services.push(
  {area:'water',service_key:'suggested-1',name:'Water delivery',status:'has_provider'},
  {area:'water',service_key:'suggested-2',name:'Pump repairs',status:'self'},
  {area:'water',service_key:'suggested-3',name:'Trough and pipe repairs',status:'needs_help'},
  {area:'water',service_key:'suggested-4',name:'Tank cleaning',status:'irrelevant'},
  {area:'fencing',service_key:'suggested-1',name:'Fence repairs',status:'sorted'},
  {area:'fencing',service_key:'suggested-2',name:'New fencing',status:'sorted'},
  {area:'fencing',service_key:'suggested-3',name:'Gates',status:'irrelevant'},
  {area:'fencing',service_key:'suggested-4',name:'Electric fencing',status:'sorted'},
  {area:'trees',service_key:'suggested-2',name:'Tree removal',status:'needs_help'},
  {area:'water',service_key:'custom-x',name:'Check the spring',status:'needs_help'})
 data.links.push({area:'water',service_key:'suggested-1',provider_id:'p1'})
 data.people.push({id:'p1',full_name:'Ruahine Water Cartage',display_name:null,region:null})
 data.contacts.push({id:'c1',name:'Andy',phone:null,email:null,note:null})
 data.contactLinks.push({area:'water',service_key:'suggested-1',contact_id:'c1'})
 const areas=propertyAreas(data)
 // Hidden areas are not on the property, so their gaps are not listed.
 assert.deepEqual(propertyGaps(areas).map(({area,service})=>area.id+'/'+service.name),['water/Trough and pipe repairs','water/Check the spring'])
 const water=areas.find(area=>area.id==='water')
 assert.deepEqual(propertyAreaWho(data,water),['You','Ruahine Water Cartage','Andy'])
 const progress=propertyAreaProgress(water,propertyAreaWho(data,water))
 assert.deepEqual([progress.sorted,progress.help,progress.na,progress.left,progress.total],[2,2,1,0,4])
 assert.equal(progress.tag,'2 needs help')
 assert.equal(progress.tone,'help')
 assert.equal(progress.summary,'2 sorted · 2 needs help · You, Ruahine Water Cartage +1')
 const fencing=propertyAreaProgress(areas.find(area=>area.id==='fencing'))
 assert.deepEqual([fencing.tag,fencing.tone,fencing.summary],['All sorted','done','3 sorted'])
 const animals=propertyAreaProgress(areas.find(area=>area.id==='livestock'))
 assert.deepEqual([animals.tag,animals.tone,animals.summary.endsWith(' to check · tap to set up, about 30 seconds')],['Not started','neutral',true])
 const partly=propertyAreaProgress({services:[{status:'sorted'},{status:null},{status:null}]})
 assert.deepEqual([partly.tag,partly.summary],['2 to check','1 sorted · 2 to check'])
 // Needs help never hides what is still unanswered.
 const mixed=propertyAreaProgress({services:[{status:'needs_help'},{status:null},{status:'sorted'},{status:'irrelevant'}]})
 assert.deepEqual([mixed.tag,mixed.summary,mixed.help,mixed.left,mixed.sorted],['1 needs help','1 sorted · 1 needs help · 1 to check',1,1,1])
 assert.equal(propertyAreaProgress({services:[{status:'irrelevant'}]}).tag,'All sorted')
})

test('completed work maps its category (and title) to a part of the property and a service',()=>{
 const target=work=>{const found=propertyWorkTarget(work);return found&&found.area+'/'+found.name}
 // Every category except General Rural Help has an area, and every mapped area exists.
 for(const category of CATEGORIES){
  if(category==='General Rural Help'){assert.equal(propertyWorkTarget({category,title:'Odd jobs'}),null);continue}
  if(category==='Transport & Delivery')continue
  const found=propertyWorkTarget({category,title:''})
  assert.ok(found,category)
  assert.ok(SUPPORT_AREAS.find(area=>area.id===found.area).services.some(service=>service.key===found.service_key),category)
 }
 for(const areas of Object.values(PROPERTY_CATEGORY_AREAS))for(const id of areas)assert.ok(SUPPORT_AREAS.some(area=>area.id===id),id)
 assert.equal(target({category:'Fencing & Gates',title:'Fix the boundary'}),'fencing/Fence repairs')
 assert.equal(target({category:'Fencing & Gates',title:'New gate for the yards'}),'fencing/Gates')
 assert.equal(target({category:'Water & Drainage',title:'Pump stopped – pump repair'}),'water/Pump repairs')
 assert.equal(target({category:'Water & Drainage',title:'Clear the culvert'}),'access/Drainage and culverts')
 assert.equal(target({category:'Land & Vegetation',title:'Tree removal by the shed'}),'trees/Tree removal')
 assert.equal(target({category:'Land & Vegetation',title:'Topping the back paddock'}),'land/Paddock mowing')
 assert.equal(target({category:'Spraying & Pest Control',title:'Possum control'}),'spraying/Possum/rabbit control')
 assert.equal(target({category:'Animals & Farm Sitting',title:'Shearing 40 ewes'}),'livestock/Shearing')
 assert.equal(target({category:'Property & House Sitting',title:'House sitting over Christmas'}),'sitting/House sitting')
 assert.equal(target({category:'Earthworks & Driveways',title:'Driveway'}),'access/Grading')
 assert.equal(target({category:'Buildings & Maintenance',title:'Fix the shed door'}),'upkeep/General maintenance')
 // Transport is too broad to guess: only offered when the title says what it was.
 assert.equal(target({category:'Transport & Delivery',title:'Gravel delivery'}),'access/Gravel delivery')
 assert.equal(target({category:'Transport & Delivery',title:'Move a couch'}),null)
 // Bookings of hire and for-sale listings use their own categories.
 assert.equal(target({category:'Machinery',kind:'hire',title:'Digger'}),'machinery/Equipment hire')
 assert.equal(target({category:'Hay & baleage',kind:'for_sale',title:'Round bales'}),'feed/Hay & baleage supply')
 assert.equal(target({category:null,title:'x'}),null)
 assert.equal(target({category:'Invented',title:'x'}),null)
})

test('the offer is skipped once the provider is in that area or the member said Not now',()=>{
 const work={category:'Fencing & Gates',title:'Fence repairs',providerId:'p1'}
 const data=empty()
 const offer=propertySuggestion(data,[],work)
 assert.deepEqual(offer,{area:'fencing',service_key:'suggested-1',name:'Fence repairs',providerId:'p1',areaLabel:'Fences & gates'})
 assert.equal(propertySuggestionText('Andy Smith',offer),'Add Andy Smith to your property network for Fences & gates?')
 assert.equal(propertySuggestion(data,[{provider_id:'p1',area:'fencing'}],work),null)
 // A dismissal is per provider and area.
 assert.ok(propertySuggestion(data,[{provider_id:'p2',area:'fencing'},{provider_id:'p1',area:'water'}],work))
 data.links.push({area:'fencing',service_key:'suggested-3',provider_id:'p1'})
 assert.equal(propertySuggestion(data,[],work),null)
 assert.equal(propertySuggestion(empty(),[],{...work,providerId:null}),null)
 assert.equal(propertySuggestion(empty(),[],{...work,category:'General Rural Help'}),null)
})

test('accepting uses one guarded RPC; Not now stores a dismissal for that provider and area',async()=>{
 const calls=[]
 const db={rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {error:null}},
  from:table=>({upsert:async(row,options)=>{calls.push(['upsert',table,row,options]);return {error:null}}})}
 const offer=propertySuggestion(empty(),[],{category:'Water & Drainage',title:'Tank cleaning',providerId:'p1'})
 await acceptPropertySuggestion(db,offer)
 assert.deepEqual(calls[0],['rpc','accept_property_network_suggestion',{p_area:'water',p_service:'suggested-4',p_name:'Tank cleaning',p_provider:'p1'}])
 await dismissPropertySuggestion(db,'owner',offer)
 assert.deepEqual(calls[1],['upsert','property_network_suggestion_dismissals',{owner_id:'owner',provider_id:'p1',area:'water'},{ignoreDuplicates:true}])
 await assert.rejects(acceptPropertySuggestion({rpc:async()=>({error:new Error('offline')})},offer))
 // The RPC switches the area on and links the provider (has_provider) in one transaction.
 const sql=readFileSync(new URL('../supabase/migrations/20261120083245_property_network_suggestions.sql',import.meta.url),'utf8')
 assert.match(sql,/insert into public\.property_network_areas\(owner_id,area,active\) values\(actor,p_area,true\)\s+on conflict\(owner_id,area\) do update set active=true;/)
 assert.match(sql,/perform public\.link_property_network_provider\(p_area,p_service,p_name,p_provider\)/)
 assert.match(sql,/perform public\.refuse_assistant_token\(\)/)
 assert.match(sql,/primary key\(owner_id,provider_id,area\)/)
 for(const policy of ['Assistants cannot insert','Assistants cannot update','Assistants cannot delete'])assert.ok(sql.includes(policy),policy)
})

test('the offer appears only after the requester has reviewed completed work',()=>{
 const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')
 assert.match(read('src/screens/ManageTaskScreen.js'),/showCompletedActions && isTaskOwner && !!providerReview && !!acceptedBid\?\.providerId && \(\s*<PropertyNetworkSuggestion/)
 assert.match(read('src/screens/ServiceBookingDetailScreen.js'),/viewerRole === 'requester' && booking\.status === 'completed' && !!myReview && !!booking\.provider_id && \(\s*<PropertyNetworkSuggestion/)
 assert.match(read('provider-web/src/app/jobs/[id]/page.tsx'),/job\.status==='completed'&&manageRole==='requester'&&ownReview&&otherId&&<PropertyNetworkSuggestion/)
 assert.match(read('provider-web/src/app/bookings/[id]/page.tsx'),/work\.status==='completed'&&role==='requester'&&ownReview&&other&&<PropertyNetworkSuggestion/)
})

test('Home shows a network line only once there is something in it, with no setup prompt',()=>{
 const data=empty()
 assert.deepEqual(propertyNetworkHomeLines(data),[])
 data.preferences.push({area:'fencing',active:true},{area:'water',active:false})
 assert.deepEqual(propertyNetworkHomeLines(data),[])
 data.links.push({area:'fencing',service_key:'suggested-1',provider_id:'p1'},{area:'fencing',service_key:'suggested-2',provider_id:'p1'},
  {area:'water',service_key:'suggested-1',provider_id:'p9'})
 data.contactLinks.push({area:'fencing',service_key:'suggested-1',contact_id:'c1'})
 assert.deepEqual(propertyNetworkHomeLines(data),['2 people in your property network'])
 data.services.push({area:'fencing',service_key:'suggested-3',name:'Gates',status:'needs_help'})
 assert.deepEqual(propertyNetworkHomeLines(data),['2 people in your property network','1 thing you need help with'])
 data.links.length=1;data.contactLinks.length=0
 assert.deepEqual(propertyNetworkHomeLines(data)[0],'1 person in your property network')
 for(const file of ['src/screens/tabs/HomeTabScreen.js','provider-web/src/app/page.tsx']){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8')
  assert.match(source,/networkLines\.length>0&&/)
  assert.doesNotMatch(source,/Start building|setting up a support area|What.s on your property/)
 }
 // Setup only lives in My Property Network (and its map), never in onboarding or posting.
 for(const file of ['src/screens/OnboardingScreen.js','src/screens/PostJobScreen.js','provider-web/src/app/setup/page.tsx','provider-web/src/app/jobs/new/job-form.tsx']){
  let source=''
  try{source=readFileSync(new URL('../'+file,import.meta.url),'utf8')}catch{continue}
  assert.doesNotMatch(source,/propertySetupStarted|savePropertyAreas|What.s on your property/,file)
 }
})

test('missing network collections read as empty instead of crashing the screen',async()=>{
 const {normalizePropertyNetwork}=await import('../shared/propertyNetwork.ts')
 const empty={preferences:[],services:[],links:[],people:[],contacts:[],contactLinks:[]}
 assert.deepEqual(normalizePropertyNetwork(null),empty)
 assert.deepEqual(normalizePropertyNetwork({preferences:[{area:'trees',active:true}],contacts:null}),{...empty,preferences:[{area:'trees',active:true}]})
 const partial={preferences:[{area:'trees',active:true}],services:[],links:[]}
 const service={area:'trees',service_key:'firewood'}
 assert.deepEqual(linkedPropertyContacts(partial,service),[])
 assert.deepEqual(linkedPropertyProviders(partial,service),[])
 assert.deepEqual(propertyContactServices(partial,'c1'),[])
 assert.ok(propertyAreas(partial).find(area=>area.id==='trees').active)
})

test('Property network screen and app root are wrapped in error boundaries',()=>{
 const screen=readFileSync(new URL('../src/screens/PropertyNetworkScreen.js',import.meta.url),'utf8')
 assert.match(screen,/export default withScreenBoundary\(PropertyNetworkScreen,'PropertyNetwork'\)/)
 assert.match(screen,/\(data\.contacts\?\?\[\]\)\.filter/)
 const app=readFileSync(new URL('../App.js',import.meta.url),'utf8')
 assert.match(app,/<ErrorBoundary[\s\S]*<AppNavigator \/>[\s\S]*<\/ErrorBoundary>/)
 const boundary=readFileSync(new URL('../src/components/ErrorBoundary.js',import.meta.url),'utf8')
 for(const field of ['screen','message','stack','componentStack','appVersion','updateId'])assert.match(boundary,new RegExp(field+':'))
 assert.match(boundary,/trackEvent\('app_crash'/)
})

test('setup says Set up my network first and Save property areas when editing, and keeps answers',async()=>{
 for(const file of ['../src/screens/PropertyNetworkScreen.js','../provider-web/src/app/property-network/property-network.tsx']){
  const source=readFileSync(new URL(file,import.meta.url),'utf8')
  assert.match(source,/started\?'Save property areas':'Set up my network \('/,file)
  assert.match(source,/its answers and providers are kept if you add it back/,file)
 }
 // Saving areas only flips active flags: services and links of unticked areas stay.
 const calls=[]
 const client={from:table=>({upsert:rows=>{calls.push([table,rows]);return Promise.resolve({error:null})},delete(){throw Error('no deletes')}})}
 await savePropertyAreas(client,'me',['water'])
 assert.equal(calls.length,1);assert.equal(calls[0][0],'property_network_areas')
 assert.ok(calls[0][1].every(row=>row.active===(row.area==='water')))
})

test('removing a provider or contact link asks first on both clients',()=>{
 const native=readFileSync(new URL('../src/screens/PropertyNetworkScreen.js',import.meta.url),'utf8')
 assert.equal((native.match(/label="Remove link"[^\n]*confirmUnlink\(/g)||[]).length,2)
 assert.match(native,/text:'Remove',style:'destructive',onPress:\(\)=>void unlink\(/)
 const web=readFileSync(new URL('../provider-web/src/app/property-network/property-network.tsx',import.meta.url),'utf8')
 assert.match(web,/if\(!window\.confirm\('Remove '\+\(name\|\|'this link'\)/)
})
