import {allRows} from './relationshipHistory'

export const SUPPORT_AREAS = [
 {id:'water',label:'Water',icon:'water-outline',glyph:'💧',category:'Water & Drainage',services:['Water delivery','Pump repairs','Trough and pipe repairs','Tank cleaning']},
 {id:'land',label:'Pasture & Land',icon:'leaf-outline',glyph:'🌱',category:'Land & Vegetation',services:['Weed spraying','Lime spreading','Pasture advice','Paddock mowing']},
 {id:'fencing',label:'Fencing',icon:'grid-outline',glyph:'▦',category:'Fencing & Gates',services:['Fence repairs','New fencing','Gates','Electric fencing']},
 {id:'livestock',label:'Livestock',icon:'paw-outline',glyph:'🐾',category:'Animals & Farm Sitting',services:['Stock handling','Shearing','Animal care','Grazing advice']},
 {id:'access',label:'Access & Driveways',icon:'trail-sign-outline',glyph:'↗',category:'Earthworks & Driveways',services:['Gravel delivery','Grading','Drainage and culverts']},
 {id:'upkeep',label:'Property Upkeep',icon:'hammer-outline',glyph:'⚒',category:'Buildings & Maintenance',services:['Gutter cleaning','Roof repairs','General maintenance']},
 {id:'trees',label:'Trees & Firewood',icon:'leaf-outline',glyph:'♠',category:'Land & Vegetation',services:['Tree trimming','Tree removal','Firewood']},
 {id:'machinery',label:'Machinery',icon:'construct-outline',glyph:'⚙',category:'Machinery & Repairs',services:['Tractor work','Equipment repairs','Equipment hire']},
] as const

export const PROPERTY_SERVICE_STATES={
 has_provider:'I have a local provider',
 self:'I do this myself',
 needs_help:'I need to find someone',
 irrelevant:'Not relevant to my property',
} as const

export const PROPERTY_AREA_DESCRIPTIONS={
 water:'Water supply, pumps, tanks and troughs.',
 land:'Paddock care, weeds and pasture improvement.',
 fencing:'Fences, gates and electric fencing.',
 livestock:'Stock handling, shearing and animal care.',
 access:'Driveways, gravel and drainage.',
 upkeep:'Buildings, gutters and general maintenance.',
 trees:'Tree trimming, removal and firewood.',
 machinery:'Equipment hire, repairs and tractor work.',
}

export type AreaId=typeof SUPPORT_AREAS[number]['id']
export type ServiceStatus=keyof typeof PROPERTY_SERVICE_STATES
export type PropertyService={area:AreaId;service_key:string;name:string;status:ServiceStatus|null}
export type PropertyProvider={id:string;full_name:string|null;display_name:string|null;region:string|null}
type AreaPreference={area:AreaId;active:boolean}
type ProviderLink={area:AreaId;service_key:string;provider_id:string}
export type NetworkData={preferences:AreaPreference[];services:PropertyService[];links:ProviderLink[];people:PropertyProvider[]}
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
  upsert(row:Record<string,unknown>,options?:{ignoreDuplicates:boolean}):PromiseLike<{error:unknown}>
 }
 rpc(name:string,args:Record<string,unknown>):PromiseLike<{error:unknown}>
}

export function propertyAreas(data:Pick<NetworkData,'preferences'|'services'|'links'>){
 return SUPPORT_AREAS.map((area,index)=>{
  const stored=new Map(data.services.filter(service=>service.area===area.id).map(service=>[service.service_key,service]))
  const services:PropertyService[]=area.services.map((name,slot)=>{
   const key='suggested-'+(slot+1)
   return stored.get(key) ?? {area:area.id,service_key:key,name,status:null}
  })
  services.push(...[...stored.values()].filter(service=>service.service_key.startsWith('custom-')))
  const linkedCount=new Set(data.links.filter(row=>row.area===area.id).map(row=>row.provider_id)).size
  return {...area,services,active:data.preferences.find(row=>row.area===area.id)?.active??index<6,
   hasProvider:linkedCount>0,linkedCount,
   needsHelp:services.some(service=>service.status==='needs_help'),
   configured:services.some(service=>service.status!==null)}
 })
}

export const PROPERTY_DIAGRAM_RATIO=1.55
export const PROPERTY_NODE_WIDTH=25.5
export const PROPERTY_NODE_HEIGHT=84

export function propertyAreaStatus(area:{linkedCount:number;needsHelp:boolean;configured:boolean}){
 const badges=[]
 if(area.linkedCount)badges.push({label:area.linkedCount+' linked',tone:'linked'})
 if(area.needsHelp)badges.push({label:'Needs support',tone:'gap'})
 if(!badges.length)badges.push({label:area.configured?'Configured':'Not configured',tone:'neutral'})
 return badges
}

// Offset the denser ring to leave room for paired nodes above and below the hub.
export function propertySpokes(count:number){
 return Array.from({length:count},(_,index)=>{
  const dense=count>=7
  const radians=(360*index/(dense?8:count)-(dense?67.5:90))*Math.PI/180
  const dx=36*Math.cos(radians),dy=39*Math.sin(radians)
  return {angle:Math.atan2(dy*PROPERTY_DIAGRAM_RATIO,dx)*180/Math.PI,
   length:Math.hypot(dx,dy*PROPERTY_DIAGRAM_RATIO),x:50+dx,y:50+dy}
 })
}

export const propertyProviderName=(person:PropertyProvider)=>person.full_name||person.display_name||'Provider'
export function propertyServiceCategory(area:Pick<typeof SUPPORT_AREAS[number],'id'|'category'>,service:PropertyService){
 if(area.id==='land'&&service.service_key==='suggested-1')return 'Spraying & Pest Control'
 if(area.id==='land'&&service.service_key==='suggested-2')return 'Cropping, Hay & Feed'
 if(area.id==='access'&&service.service_key==='suggested-3')return 'Water & Drainage'
 return area.category
}

export function filterPropertyProviders(people:PropertyProvider[],linked:PropertyProvider[],search:string){
 const linkedIds=new Set(linked.map(person=>person.id))
 const query=search.trim().toLocaleLowerCase('en-NZ')
 return people.filter(person=>!linkedIds.has(person.id)&&(!query||
  [propertyProviderName(person),person.region].some(value=>value?.toLocaleLowerCase('en-NZ').includes(query))))
}

export const propertyDiscoveryPath=(category:string)=>'/browse?kind=service&category='+encodeURIComponent(category)

export function linkedPropertyProviders(data:NetworkData,service:PropertyService){
 const ids=new Set(data.links.filter(link=>link.area===service.area&&link.service_key===service.service_key).map(link=>link.provider_id))
 return data.people.filter(person=>ids.has(person.id))
}

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
 const [preferences,services,links]=await Promise.all([
  allRows(()=>db.from('property_network_areas').select<AreaPreference>('area,active').eq('owner_id',owner).order('area')),
  allRows(()=>db.from('property_network_services').select<PropertyService>('area,service_key,name,status').eq('owner_id',owner).order('area').order('service_key')),
  allRows(()=>db.from('property_network_providers').select<ProviderLink>('area,service_key,provider_id').eq('owner_id',owner).order('area').order('service_key').order('provider_id')),
 ])
 const people=await loadPeople(db,links.map(link=>link.provider_id))
 return {preferences,services,links,people}
}

export async function discoverPropertyProviders(client:unknown,owner:string,category:string){
 const db=client as Client
 const listings=await allRows(()=>db.from('services').select<{provider_id:string}>('provider_id')
  .eq('is_active',true).eq('kind','service').eq('category',category).is('closed_at',null).order('id'))
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
