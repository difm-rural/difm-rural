import {CATEGORIES} from './categories'
import {localityFromAddress} from './locality'
import {allRows} from './relationshipHistory'
import type {AreaId,PropertyService} from './propertyNetwork'

type Need={categories:readonly string[];terms:readonly string[]}
const need=(categories:string[],...terms:string[]):Need=>({categories,terms})

export const PROPERTY_NEEDS:Record<AreaId,readonly Need[]>={
 water:[
  need(['Water & Drainage','Transport & Delivery'],'water delivery','water cartage','water cart'),
  need(['Water & Drainage'],'pump repair','pump repairs','pump servicing','pump installation'),
  need(['Water & Drainage'],'trough','troughs','water line','water lines','pipe repair','pipe repairs'),
  need(['Water & Drainage'],'tank cleaning','tank clean'),
 ],
 land:[
  need(['Spraying & Pest Control'],'weed spraying','weed control','gorse spraying'),
  need(['Cropping, Hay & Feed','Spraying & Pest Control'],'lime spreading','fertiliser spreading','fertilizer spreading'),
  need(['Land & Vegetation','Cropping, Hay & Feed'],'pasture advice','pasture management','pasture consultant'),
  need(['Land & Vegetation','Cropping, Hay & Feed'],'mowing','slashing','topping'),
 ],
 fencing:[
  need(['Fencing & Gates'],'fence repair','fence repairs','fencing repairs'),
  need(['Fencing & Gates'],'new fencing','rural fencing','fence installation'),
  need(['Fencing & Gates'],'gate','gates'),
  need(['Fencing & Gates'],'electric fencing','electric fence','electric fences'),
 ],
 livestock:[
  need(['Animals & Farm Sitting'],'stock handling','livestock handling','stock moving'),
  need(['Animals & Farm Sitting'],'shearing','shearer'),
  need(['Animals & Farm Sitting'],'animal care','animal feeding','stock checks','farm sitting'),
  need(['Animals & Farm Sitting','Cropping, Hay & Feed'],'grazing advice','grazing management'),
 ],
 access:[
  need(['Earthworks & Driveways','Transport & Delivery'],'gravel delivery','gravel cartage','aggregate delivery'),
  need(['Earthworks & Driveways'],'grading','grader','driveway repairs'),
  need(['Water & Drainage','Earthworks & Driveways'],'drainage','culvert','culverts'),
 ],
 upkeep:[
  need(['Buildings & Maintenance'],'gutter cleaning','gutter clearing'),
  need(['Buildings & Maintenance'],'roof repair','roof repairs','roofing'),
  need(['Buildings & Maintenance'],'general maintenance','property maintenance','building maintenance'),
 ],
 trees:[
  need(['Land & Vegetation'],'tree trimming','tree pruning','shelterbelt trimming'),
  need(['Land & Vegetation'],'tree removal','tree felling'),
  need(['Land & Vegetation'],'firewood'),
 ],
 machinery:[
  need(['Machinery & Repairs','Cropping, Hay & Feed'],'tractor work','tractor services'),
  need(['Machinery & Repairs'],'equipment repair','equipment repairs','machinery repair','machinery repairs','machinery servicing'),
  need(['Machinery & Repairs'],'equipment hire','machinery hire','tractor hire'),
 ],
}

export function propertyNeed(service:PropertyService,fallbackCategory:string):Need{
 const slot=/^suggested-(\d+)$/.exec(service.service_key)
 return (slot&&PROPERTY_NEEDS[service.area][Number(slot[1])-1])||
  need(CATEGORIES.includes(fallbackCategory)?[fallbackCategory]:[],service.name)
}

export function matchLocality(value:string|null|undefined){
 return value&&/^[\p{L}\p{M} .’'-]{2,70}$/u.test(value.trim())?localityFromAddress(value):''
}
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-NZ')
 .replace(/[^a-z0-9]+/g,' ').trim()
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
 const listings=await allRows(()=>db.from('services').select<Listing>('provider_id,category,title,description,location_name')
  .in('category',[...rule.categories]).eq('kind','service').eq('is_active',true).is('closed_at',null).order('id'))
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
