import {allRows} from './relationshipHistory'
import {CATEGORIES} from './categories'
import type {ListingKind} from './listingPricing'

type ServiceDef={key:string;name:string;category:string;kind?:ListingKind}
const services=(category:string,...names:(string|[string,string,ListingKind?])[])=>names.map((entry,slot):ServiceDef=>
 typeof entry==='string'?{key:'suggested-'+(slot+1),name:entry,category}
  :{key:'suggested-'+(slot+1),name:entry[0],category:entry[1],...(entry[2]?{kind:entry[2]}:{})})

// Each service keeps its stored key (`suggested-N`) for good, even when the
// list around it changes: saved rows are keyed by (area, service_key).
// `category` is the listing category its Find help opens; `kind` defaults to
// 'service'. `area.category` is the default, used for custom services.
// `icon` names the app icon (Ionicons, or `mci:` for MaterialCommunityIcons
// where Ionicons has none); the web maps area ids to Lucide icons.
export const SUPPORT_AREAS = [
 {id:'water',label:'Water',icon:'water-outline',category:'Water & Drainage',
  services:services('Water & Drainage','Water delivery','Pump repairs','Trough and pipe repairs','Tank cleaning')},
 {id:'land',label:'Pasture & Land',icon:'leaf-outline',category:'Land & Vegetation',
  // suggested-1 (Weed spraying) moved to Spraying & Pests, keeping its key.
  services:[{key:'suggested-2',name:'Lime spreading',category:'Cropping, Hay & Feed'},
   {key:'suggested-3',name:'Pasture advice',category:'Land & Vegetation'},
   {key:'suggested-4',name:'Paddock mowing',category:'Land & Vegetation'}]},
 {id:'fencing',label:'Fencing',icon:'reorder-four-outline',category:'Fencing & Gates',
  services:services('Fencing & Gates','Fence repairs','New fencing','Gates','Electric fencing')},
 {id:'livestock',label:'Livestock',icon:'paw-outline',category:'Animals & Farm Sitting',
  services:services('Animals & Farm Sitting','Stock handling','Shearing','Animal care','Grazing advice')},
 {id:'access',label:'Access & Driveways',icon:'trail-sign-outline',category:'Earthworks & Driveways',
  services:services('Earthworks & Driveways',['Gravel delivery','Transport & Delivery'],'Grading',['Drainage and culverts','Water & Drainage'])},
 {id:'upkeep',label:'Property Upkeep',icon:'hammer-outline',category:'Buildings & Maintenance',
  services:services('Buildings & Maintenance','Gutter cleaning','Roof repairs','General maintenance')},
 {id:'trees',label:'Trees & Firewood',icon:'mci:tree-outline',category:'Land & Vegetation',
  services:services('Land & Vegetation','Tree trimming','Tree removal','Firewood')},
 {id:'machinery',label:'Machinery',icon:'cog-outline',category:'Machinery & Repairs',
  services:services('Machinery & Repairs','Tractor work','Equipment repairs',['Equipment hire','Machinery','hire'])},
 {id:'spraying',label:'Spraying & Pests',icon:'bug-outline',category:'Spraying & Pest Control',
  services:[{key:'suggested-1',name:'Weed spraying',category:'Spraying & Pest Control'},
   {key:'suggested-2',name:'Pest control',category:'Spraying & Pest Control'},
   {key:'suggested-3',name:'Possum/rabbit control',category:'Spraying & Pest Control'}]},
 {id:'feed',label:'Hay & Feed',icon:'mci:barley',category:'Cropping, Hay & Feed',
  services:services('Cropping, Hay & Feed','Hay & baleage supply','Silage/baleage making','Feed delivery')},
 {id:'sitting',label:'House & Property Sitting',icon:'key-outline',category:'Property & House Sitting',
  services:services('Property & House Sitting','House sitting','Property checks','Animal feeding while away')},
] as const satisfies readonly {id:string;label:string;icon:string;category:string;services:readonly ServiceDef[]}[]

export const PROPERTY_SERVICE_STATES={
 has_provider:'I have a local provider',
 self:'I do this myself',
 needs_help:'I need to find someone',
 irrelevant:'Not relevant to my property',
} as const

export const PROPERTY_AREA_DESCRIPTIONS={
 water:'Water supply, pumps, tanks and troughs.',
 land:'Paddock care, lime and pasture improvement.',
 fencing:'Fences, gates and electric fencing.',
 livestock:'Stock handling, shearing and animal care.',
 access:'Driveways, gravel and drainage.',
 upkeep:'Buildings, gutters and general maintenance.',
 trees:'Tree trimming, removal and firewood.',
 machinery:'Equipment hire, repairs and tractor work.',
 spraying:'Weed spraying, pest control and possum and rabbit control.',
 feed:'Hay and baleage supply, silage making and feed delivery.',
 sitting:'House sitting, property checks and feeding animals while you are away.',
} satisfies Record<AreaId,string>

export type AreaId=typeof SUPPORT_AREAS[number]['id']
export type ServiceStatus=keyof typeof PROPERTY_SERVICE_STATES
export type PropertyService={area:AreaId;service_key:string;name:string;status:ServiceStatus|null}
export type PropertyProvider={id:string;full_name:string|null;display_name:string|null;region:string|null}
type AreaPreference={area:AreaId;active:boolean}
type ProviderLink={area:AreaId;service_key:string;provider_id:string}
// A private contact: someone the owner uses who is not on Rural Connections.
export type PropertyContact={id:string;name:string;phone:string|null;email:string|null;note:string|null}
type ContactLink={area:AreaId;service_key:string;contact_id:string}
export type NetworkData={preferences:AreaPreference[];services:PropertyService[];links:ProviderLink[];people:PropertyProvider[];
 contacts:PropertyContact[];contactLinks:ContactLink[]}
type Query<T>={
 eq(column:string,value:string|boolean):Query<T>
 in(column:string,values:string[]):Query<T>
 is(column:string,value:null):Query<T>
 order(column:string):Query<T>
 range(start:number,end:number):PromiseLike<{data:T[]|null;error:unknown}>
}
type DeleteQuery=PromiseLike<{error:unknown}>&{eq(column:string,value:string):DeleteQuery}
type Client={
 from(table:string):{
  select<T>(fields:string):Query<T>
  delete():DeleteQuery
  update(row:Record<string,unknown>):DeleteQuery
  upsert(row:Record<string,unknown>,options?:{ignoreDuplicates:boolean}):PromiseLike<{error:unknown}>
 }
 rpc(name:string,args:Record<string,unknown>):PromiseLike<{error:unknown}>
}

export function propertyAreas(data:Pick<NetworkData,'preferences'|'services'|'links'>&{contactLinks?:ContactLink[]}){
 return SUPPORT_AREAS.map((area,index)=>{
  const stored=new Map(data.services.filter(service=>service.area===area.id).map(service=>[service.service_key,service]))
  const services:PropertyService[]=area.services.map(({key,name})=>stored.get(key) ?? {area:area.id,service_key:key,name,status:null})
  services.push(...[...stored.values()].filter(service=>service.service_key.startsWith('custom-')))
  // Members and private contacts both count as local providers.
  const linkedCount=new Set(data.links.filter(row=>row.area===area.id).map(row=>row.provider_id)).size
   +new Set((data.contactLinks??[]).filter(row=>row.area===area.id).map(row=>row.contact_id)).size
  return {...area,services,active:data.preferences.find(row=>row.area===area.id)?.active??index<6,
   hasProvider:linkedCount>0,linkedCount,
   needsHelp:services.some(service=>service.status==='needs_help'),
   configured:services.some(service=>service.status!==null)}
 })
}

// Height:width of the diagram. Up to eight areas sit on one oval; nine or more
// use a taller oval so every node stays clear of its neighbours and the hub.
// Each ratio keeps nodes apart from PROPERTY_DIAGRAM_MIN_WIDTH up (tested).
export const PROPERTY_DIAGRAM_RATIO=1.65
export const propertyDiagramRatio=(count:number)=>count>10?2.05:count>8?1.75:PROPERTY_DIAGRAM_RATIO
export const PROPERTY_NODE_WIDTH=25.5
export const PROPERTY_NODE_HEIGHT=94
// A 320px phone screen less a 16px gutter each side (app and web).
export const PROPERTY_DIAGRAM_MIN_WIDTH=288
// The hub is a circle 24% of the diagram's width.
export const PROPERTY_HUB_SIZE=24

export function propertyAreaStatus(area:{linkedCount:number;needsHelp:boolean;configured:boolean}){
 const badges=[]
 if(area.linkedCount)badges.push({label:area.linkedCount+(area.linkedCount===1?' local provider':' local providers'),tone:'linked'})
 if(area.needsHelp)badges.push({label:'Find help',tone:'gap'})
 if(!badges.length)badges.push({label:area.configured?'Configured':'Not set up',tone:'neutral'})
 return badges
}

// Nine to eleven areas, clockwise from the top: two nodes across the top, a
// column down each side, then one or two across the bottom.
function largeRing(count:number,ratio:number){
 // Keep the top and bottom nodes inside the oval at the narrowest width.
 const bottom=count%2?1:2,side=(count-2-bottom)/2,edge=50*PROPERTY_NODE_HEIGHT/(PROPERTY_DIAGRAM_MIN_WIDTH*ratio)+.5
 const column=(sign:1|-1)=>Array.from({length:side},(_,index)=>{
  const y=edge+(100-2*edge)*(index+1)/(side+1),q=(y-50)/38
  return {x:50+sign*30*Math.sqrt(Math.max(0,1-q*q)),y}
 })
 return [{x:64,y:edge},...column(1),...(bottom===1?[{x:50,y:100-edge}]:[{x:64,y:100-edge},{x:36,y:100-edge}]),
  ...column(-1).reverse(),{x:36,y:edge}]
}

// Up to eight areas share one ring; from seven it is offset to leave room for
// paired nodes above and below the hub.
export function propertySpokes(count:number,ratio=propertyDiagramRatio(count)){
 const points=count>8?largeRing(count,ratio):Array.from({length:count},(_,index)=>{
  const dense=count>=7
  const radians=(360*index/(dense?8:count)-(dense?67.5:90))*Math.PI/180
  return {x:50+36*Math.cos(radians),y:50+39*Math.sin(radians)}
 })
 return points.map(({x,y})=>{
  const dx=x-50,dy=y-50
  return {angle:Math.atan2(dy*ratio,dx)*180/Math.PI,length:Math.hypot(dx,dy*ratio),x,y}
 })
}

export const propertyProviderName=(person:PropertyProvider)=>person.full_name||person.display_name||'Provider'
type AreaLike={id:string;category:string}
type ServiceRef=Pick<PropertyService,'service_key'>
// Where a service's Find help looks: its own listing category and kind, or the
// area's category for a custom service.
export function propertyServiceTarget(area:AreaLike,service:ServiceRef):{category:string;kind:ListingKind}{
 const definitions:readonly ServiceDef[]=SUPPORT_AREAS.find(row=>row.id===area.id)?.services??[]
 const known=definitions.find(row=>row.key===service.service_key)
 return {category:known?.category??area.category,kind:known?.kind??'service'}
}
export const propertyServiceCategory=(area:AreaLike,service:ServiceRef)=>propertyServiceTarget(area,service).category
// Jobs use only the main categories, so a hire service posts under its area's.
export function propertyJobCategory(area:AreaLike,service:ServiceRef){
 const {category}=propertyServiceTarget(area,service)
 return CATEGORIES.includes(category)?category:area.category
}

export function filterPropertyProviders(people:PropertyProvider[],linked:PropertyProvider[],search:string){
 const linkedIds=new Set(linked.map(person=>person.id))
 const query=search.trim().toLocaleLowerCase('en-NZ')
 return people.filter(person=>!linkedIds.has(person.id)&&(!query||
  [propertyProviderName(person),person.region].some(value=>value?.toLocaleLowerCase('en-NZ').includes(query))))
}

export const propertyDiscoveryPath=(category:string,kind:ListingKind='service')=>
 '/browse?'+new URLSearchParams({kind,category})

export function linkedPropertyProviders(data:NetworkData,service:PropertyService){
 const ids=new Set(data.links.filter(link=>link.area===service.area&&link.service_key===service.service_key).map(link=>link.provider_id))
 return data.people.filter(person=>ids.has(person.id))
}

export function linkedPropertyContacts(data:Pick<NetworkData,'contacts'|'contactLinks'>,service:Pick<PropertyService,'area'|'service_key'>){
 const ids=new Set(data.contactLinks.filter(link=>link.area===service.area&&link.service_key===service.service_key).map(link=>link.contact_id))
 return data.contacts.filter(contact=>ids.has(contact.id))
}
// Every service a contact covers, as {area, service_key} pairs.
export const propertyContactServices=(data:Pick<NetworkData,'contactLinks'>,contactId:string)=>
 data.contactLinks.filter(link=>link.contact_id===contactId)

// Contact validation shared by the app, the web and the database checks.
export const PROPERTY_CONTACT_LIMITS={name:80,phone:30,email:254,note:200} as const
export type PropertyContactInput={name?:string|null;phone?:string|null;email?:string|null;note?:string|null}
type ContactField=keyof typeof PROPERTY_CONTACT_LIMITS
const blank=(value:string|null|undefined)=>{const text=(value??'').trim();return text||null}
export function propertyContactFields(input:PropertyContactInput){
 const name=blank(input.name),phone=blank(input.phone)?.replace(/\s+/g,' ')??null,email=blank(input.email)?.toLowerCase()??null,note=blank(input.note)
 const errors:Partial<Record<ContactField,string>>={}
 if(!name)errors.name='Enter a name.'
 else if(name.length>PROPERTY_CONTACT_LIMITS.name)errors.name='Use 80 characters or fewer.'
 if(phone&&(phone.length>PROPERTY_CONTACT_LIMITS.phone||!/^[0-9 +()-]+$/.test(phone)||!/[0-9]/.test(phone)))
  errors.phone='Use digits, spaces, + ( ) and - only (30 characters or fewer).'
 if(email&&(email.length>PROPERTY_CONTACT_LIMITS.email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))errors.email='Enter an email address like name@example.co.nz.'
 if(note&&note.length>PROPERTY_CONTACT_LIMITS.note)errors.note='Use 200 characters or fewer.'
 return {value:{name:name??'',phone,email,note},errors,valid:!Object.keys(errors).length}
}
const contactRow=(input:PropertyContactInput)=>{
 const result=propertyContactFields(input)
 if(!result.valid)throw new Error(Object.values(result.errors)[0])
 return result.value
}
export const propertyContactPhoneHref=(phone:string)=>'tel:'+phone.replace(/[^0-9+]/g,'')
export const propertyContactEmailHref=(email:string)=>'mailto:'+email
export const PROPERTY_SITE_URL='https://ruralconnections.nz'
export const propertyContactInviteText=(contact:Pick<PropertyContact,'name'>)=>
 'Hi '+contact.name.split(' ')[0]+', I use Rural Connections to keep track of the locals who help on my property. Join so people nearby can find you: '+PROPERTY_SITE_URL

async function loadPeople(db:Client,ids:string[]){
 const people:PropertyProvider[]=[]
 const unique=[...new Set(ids)]
 for(let index=0;index<unique.length;index+=200){
  people.push(...await allRows(()=>db.from('profiles_public').select<PropertyProvider>('id,full_name,display_name,region')
   .in('id',unique.slice(index,index+200)).order('id')))
 }
 return people
}

export async function loadPropertyNetwork(client:unknown,owner:string):Promise<NetworkData>{
 const db=client as Client
 const [preferences,services,links,contacts,contactLinks]=await Promise.all([
  allRows(()=>db.from('property_network_areas').select<AreaPreference>('area,active').eq('owner_id',owner).order('area')),
  allRows(()=>db.from('property_network_services').select<PropertyService>('area,service_key,name,status').eq('owner_id',owner).order('area').order('service_key')),
  allRows(()=>db.from('property_network_providers').select<ProviderLink>('area,service_key,provider_id').eq('owner_id',owner).order('area').order('service_key').order('provider_id')),
  allRows(()=>db.from('property_network_contacts').select<PropertyContact>('id,name,phone,email,note').eq('owner_id',owner).order('name').order('id')),
  allRows(()=>db.from('property_network_contact_links').select<ContactLink>('area,service_key,contact_id').eq('owner_id',owner).order('area').order('service_key').order('contact_id')),
 ])
 const people=await loadPeople(db,links.map(link=>link.provider_id))
 return {preferences,services,links,people,contacts,contactLinks}
}

export async function discoverPropertyProviders(client:unknown,owner:string,category:string,kind:ListingKind='service'){
 const db=client as Client
 const listings=await allRows(()=>db.from('services').select<{provider_id:string}>('provider_id')
  .eq('is_active',true).eq('kind',kind).eq('category',category).is('closed_at',null).order('id'))
 return loadPeople(db,listings.map(row=>row.provider_id).filter(id=>id!==owner))
}

export async function setPropertyArea(client:unknown,owner:string,area:AreaId,active:boolean){
 const {error}=await (client as Client).from('property_network_areas').upsert({owner_id:owner,area,active})
 if(error)throw error
}

export async function savePropertyService(client:unknown,owner:string,service:PropertyService,createOnly=false){
 const {error}=await (client as Client).from('property_network_services').upsert({...service,owner_id:owner},{ignoreDuplicates:createOnly})
 if(error)throw error
}

export async function setPropertyProvider(client:unknown,owner:string,service:PropertyService,providerId:string,link:boolean){
 const db=client as Client
 const {error}=link
  ?await db.rpc('link_property_network_provider',{p_area:service.area,p_service:service.service_key,p_name:service.name,p_provider:providerId})
  :await db.from('property_network_providers').delete().eq('owner_id',owner).eq('area',service.area)
   .eq('service_key',service.service_key).eq('provider_id',providerId)
 if(error)throw error
}

// `id` comes from the caller so a retried save cannot create a duplicate.
export async function createPropertyContact(client:unknown,owner:string,id:string,input:PropertyContactInput){
 const {error}=await (client as Client).from('property_network_contacts').upsert({id,owner_id:owner,...contactRow(input)},{ignoreDuplicates:true})
 if(error)throw error
}

export async function updatePropertyContact(client:unknown,owner:string,id:string,input:PropertyContactInput){
 const {error}=await (client as Client).from('property_network_contacts').update(contactRow(input)).eq('owner_id',owner).eq('id',id)
 if(error)throw error
}

export async function deletePropertyContact(client:unknown,owner:string,id:string){
 const {error}=await (client as Client).from('property_network_contacts').delete().eq('owner_id',owner).eq('id',id)
 if(error)throw error
}

export async function setPropertyContact(client:unknown,owner:string,service:PropertyService,contactId:string,link:boolean){
 const db=client as Client
 const {error}=link
  ?await db.rpc('link_property_network_contact',{p_area:service.area,p_service:service.service_key,p_name:service.name,p_contact:contactId})
  :await db.from('property_network_contact_links').delete().eq('owner_id',owner).eq('area',service.area)
   .eq('service_key',service.service_key).eq('contact_id',contactId)
 if(error)throw error
}

// "They've joined": the member takes over every service the contact covers and
// the contact is deleted, in one transaction.
export async function replacePropertyContact(client:unknown,contactId:string,providerId:string){
 const {error}=await (client as Client).rpc('replace_property_network_contact',{p_contact:contactId,p_provider:providerId})
 if(error)throw error
}
