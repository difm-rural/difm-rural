import {CATEGORIES} from './categories'
import {localityFromAddress} from './locality'
import {allRows} from './relationshipHistory'
import type {AreaId,PropertyService} from './propertyNetwork'
import type {ListingKind} from './listingPricing'

type Need={categories:readonly string[];terms:readonly string[];kind?:ListingKind}
const need=(categories:string[],...terms:string[]):Need=>({categories,terms})
const hire=(categories:string[],...terms:string[]):Need=>({categories,terms,kind:'hire'})

// Keyed by each service's stored key (see SUPPORT_AREAS). The first category
// is the service's own; the rest widen the search.
export const PROPERTY_NEEDS:Record<AreaId,Readonly<Record<string,Need>>>={
 water:{
  'suggested-1':need(['Water & Drainage','Transport & Delivery'],'water delivery','water cartage','water cart'),
  'suggested-2':need(['Water & Drainage'],'pump repair','pump repairs','pump servicing','pump installation'),
  'suggested-3':need(['Water & Drainage'],'trough','troughs','water line','water lines','pipe repair','pipe repairs'),
  'suggested-4':need(['Water & Drainage'],'tank cleaning','tank clean'),
 },
 land:{
  'suggested-2':need(['Cropping, Hay & Feed','Spraying & Pest Control'],'lime spreading','fertiliser spreading','fertilizer spreading'),
  'suggested-3':need(['Land & Vegetation','Cropping, Hay & Feed'],'pasture advice','pasture management','pasture consultant'),
  'suggested-4':need(['Land & Vegetation','Cropping, Hay & Feed'],'mowing','slashing','topping'),
 },
 fencing:{
  'suggested-1':need(['Fencing & Gates'],'fence repair','fence repairs','fencing repairs'),
  'suggested-2':need(['Fencing & Gates'],'new fencing','rural fencing','fence installation'),
  'suggested-3':need(['Fencing & Gates'],'gate','gates'),
  'suggested-4':need(['Fencing & Gates'],'electric fencing','electric fence','electric fences'),
 },
 livestock:{
  'suggested-1':need(['Animals & Farm Sitting'],'stock handling','livestock handling','stock moving'),
  'suggested-2':need(['Animals & Farm Sitting'],'shearing','shearer'),
  'suggested-3':need(['Animals & Farm Sitting'],'animal care','animal feeding','stock checks','farm sitting'),
  'suggested-4':need(['Animals & Farm Sitting','Cropping, Hay & Feed'],'grazing advice','grazing management'),
 },
 access:{
  'suggested-1':need(['Transport & Delivery','Earthworks & Driveways'],'gravel delivery','gravel cartage','aggregate delivery'),
  'suggested-2':need(['Earthworks & Driveways'],'grading','grader','driveway repairs'),
  'suggested-3':need(['Water & Drainage','Earthworks & Driveways'],'drainage','culvert','culverts'),
 },
 upkeep:{
  'suggested-1':need(['Buildings & Maintenance'],'gutter cleaning','gutter clearing'),
  'suggested-2':need(['Buildings & Maintenance'],'roof repair','roof repairs','roofing'),
  'suggested-3':need(['Buildings & Maintenance'],'general maintenance','property maintenance','building maintenance'),
 },
 trees:{
  'suggested-1':need(['Land & Vegetation'],'tree trimming','tree pruning','shelterbelt trimming'),
  'suggested-2':need(['Land & Vegetation'],'tree removal','tree felling'),
  'suggested-3':need(['Land & Vegetation'],'firewood'),
 },
 machinery:{
  'suggested-1':need(['Machinery & Repairs','Cropping, Hay & Feed'],'tractor work','tractor services'),
  'suggested-2':need(['Machinery & Repairs'],'equipment repair','equipment repairs','machinery repair','machinery repairs','machinery servicing'),
  'suggested-3':hire(['Machinery','Implements'],'equipment hire','machinery hire','tractor hire','hire'),
 },
 spraying:{
  'suggested-1':need(['Spraying & Pest Control'],'weed spraying','weed control','gorse spraying'),
  'suggested-2':need(['Spraying & Pest Control'],'pest control','pest management','rodent control','rat control'),
  'suggested-3':need(['Spraying & Pest Control'],'possum control','rabbit control','possum trapping','rabbit shooting','possums','rabbits'),
 },
 feed:{
  'suggested-1':need(['Cropping, Hay & Feed','Transport & Delivery'],'hay','baleage','hay supply','hay bales','baleage supply'),
  'suggested-2':need(['Cropping, Hay & Feed','Machinery & Repairs'],'silage','silage making','baleage making','baling','wrapping'),
  'suggested-3':need(['Cropping, Hay & Feed','Transport & Delivery'],'feed delivery','hay delivery','baleage delivery','supplement delivery'),
 },
 sitting:{
  'suggested-1':need(['Property & House Sitting'],'house sitting','house sitter','house minding'),
  'suggested-2':need(['Property & House Sitting'],'property checks','property check','property minding'),
  'suggested-3':need(['Property & House Sitting','Animals & Farm Sitting'],'animal feeding','pet feeding','pet sitting','feeding animals','farm sitting'),
 },
}

export function propertyNeed(service:PropertyService,fallbackCategory:string):Need{
 return PROPERTY_NEEDS[service.area]?.[service.service_key]||
  need(CATEGORIES.includes(fallbackCategory)?[fallbackCategory]:[],service.name)
}

export function matchLocality(value:string|null|undefined){
 return value&&/^[\p{L}\p{M} .’'-]{2,70}$/u.test(value.trim())?localityFromAddress(value):''
}
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-NZ')
 .replace(/[^a-z0-9]+/g,' ').trim()
// Supported "wider region" values: New Zealand's 16 regions, spelled as they
// appear in addresses. The provider search offers these instead of free text.
export const NZ_REGIONS=['Northland','Auckland','Waikato','Bay of Plenty','Gisborne',"Hawke's Bay",'Taranaki',
 'Manawatū-Whanganui','Wellington','Tasman','Nelson','Marlborough','West Coast','Canterbury','Otago','Southland'] as const
const regionKey=(value:string)=>normalize(value.replace(/[’‘]/g,"'")).replace(/ region$/,'')
// The one region named in an address or place ("Waitoki, Auckland, New Zealand"
// → Auckland). Null when none, or more than one, is named: never a guess.
export function regionFromText(value:string|null|undefined):string|null{
 if(!value)return null
 const parts=new Set(value.split(',').map(regionKey).filter(Boolean))
 const found=NZ_REGIONS.filter(region=>parts.has(regionKey(region)))
 return found.length===1?found[0]:null
}
// The region for a locality, from autocomplete suggestions for that place.
// Only suggestions that start with the locality count, and they must agree.
export function regionForLocality(locality:string,suggestions:readonly {description?:string|null}[]){
 const place=normalize(locality||'')
 if(!place)return null
 const regions=new Set(suggestions.filter(item=>normalize((item.description||'').split(',')[0]||'')===place)
  .map(item=>regionFromText(item.description)).filter((value):value is string=>!!value))
 return regions.size===1?[...regions][0]:null
}
type Listing={provider_id:string|null;category:string;title:string;description:string|null;location_name:string|null}
type Person={id:string;full_name:string|null;display_name:string|null;avatar_url:string|null}
type Rating={reviewee_id:string;rating:number}
type Query<T>={eq(key:string,value:string|boolean):Query<T>;in(key:string,value:string[]):Query<T>;is(key:string,value:null):Query<T>;
 order(key:string):Query<T>;range(from:number,to:number):PromiseLike<{data:T[]|null;error:unknown}>}
type Client={from(table:string):{select<T>(fields:string):Query<T>}}

export function rankPropertyListings(listings:Listing[],rule:Need,owner:string,locality:string,region:string,saved:string[],worked:string[]){
 const place=normalize(matchLocality(locality)||''), wider=normalize(matchLocality(region)||'')
 const matches=new Map<string,{id:string;services:string[];tier:number;reason:string}>()
 for(const row of listings){
  if(!row.provider_id||row.provider_id===owner||!rule.categories.includes(row.category))continue
  const text=' '+normalize(row.title+' '+(row.description||''))+' '
  if(!rule.terms.some(term=>normalize(term)&&text.includes(' '+normalize(term)+' ')))continue
  const chunks=(row.location_name||'').split(',').map(part=>normalize(localityFromAddress(part)))
  const nearby=!!place&&chunks.includes(place)
  const regional=!!wider&&chunks.includes(wider)
  if(!nearby&&!regional)continue
  const tier=saved.includes(row.provider_id)||worked.includes(row.provider_id)?0:nearby?1:2
  const found=matches.get(row.provider_id)
  const label=nearby?locality:region
  const reason='Service listing advertises '+label
  if(found){
   if(!found.services.includes(row.title))found.services.push(row.title)
   found.tier=Math.min(found.tier,tier)
   if(nearby&&found.reason!==reason)found.reason=reason
  }else matches.set(row.provider_id,{id:row.provider_id,services:[row.title],tier,reason})
 }
 return [...matches.values()].sort((a,b)=>a.tier-b.tier||a.id.localeCompare(b.id))
}

export async function loadPropertyMatches(client:unknown,owner:string,rule:Need,locality:string,region:string,saved:string[],worked:string[]){
 const db=client as Client
 if(!rule.categories.length||(!matchLocality(locality)&&!matchLocality(region)))return []
 const listings=await allRows(()=>db.from('services_public').select<Listing>('provider_id,category,title,description,location_name')
  .in('category',[...rule.categories]).eq('kind',rule.kind??'service').eq('is_active',true).is('closed_at',null).order('id'))
 const shortlist=rankPropertyListings(listings,rule,owner,locality,region,saved,worked).slice(0,24)
 const ids=shortlist.map(result=>result.id)
 if(!ids.length)return []
 const [people,ratings]=await Promise.all([
  allRows(()=>db.from('profiles_public').select<Person>('id,full_name,display_name,avatar_url').in('id',ids).order('id')),
  allRows(()=>db.from('reviews').select<Rating>('reviewee_id,rating').in('reviewee_id',ids).eq('reviewee_role','provider').order('id')).catch(()=>[]),
 ])
 return shortlist.flatMap(result=>{
  const person=people.find(row=>row.id===result.id)
  if(!person)return []
  const votes=ratings.filter(review=>review.reviewee_id===result.id)
  return [{...result,...person,region:null,saved:saved.includes(person.id),worked:worked.includes(person.id),
   rating:votes.length?(votes.reduce((sum,review)=>sum+review.rating,0)/votes.length).toFixed(1):null,reviewCount:votes.length}]
 })
}
export type PropertyMatch=Awaited<ReturnType<typeof loadPropertyMatches>>[number]
