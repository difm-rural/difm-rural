// Saved job <-> Post a Job wizard. One place for both directions, so a column the
// wizard writes can't be left out of what it loads. No React here.
import { localityFromAddress } from './locality'
import { editorScheduleType, nzCalendarDay } from './postingDates'

type Row=Record<string,any>
type Point={latitude:number;longitude:number}

// Everything the wizard shows for a saved job. Missing values stay empty: nothing
// is filled in here that the job doesn't already have.
export function jobEditSeed(job:Row){
 return {
  category:job.category||'',
  title:job.title||'',
  scheduleType:editorScheduleType(job),
  scheduledDate:job.scheduled_date||null,
  dateFrom:job.date_from||null,
  dateTo:job.date_to||null,
  hideExactLocation:job.hide_exact_location||false,
  locationArea:job.location_area||'',
  latitude:job.latitude||null,
  longitude:job.longitude||null,
  jobAddress:job.location_name||'',
  locationNote:job.location_note||'',
  areaPolygon:job.area_polygon||[],
  areaHectares:job.area_hectares||null,
  description:job.description||'',
  photos:job.photos||[],
  priceType:job.price_type||'fixed',
  price:job.price?String(job.price):'',
  materialsType:job.materials_type||'',
  accessConditions:job.access_conditions||[],
  _editJobId:job.id,
  repeatedFromJobId:job.repeated_from_job_id||null,
  recurrenceFrequency:job.recurrence_frequency||'one_time',
 }
}

// The columns Review saves. `category` is the one shown on Review.
export function jobPayload(data:Row,category:string){
 const area=data.areaPolygon||[],access=data.accessConditions||[]
 return {
  title:data.title,
  description:data.description,
  category,
  price_type:data.priceType,
  price:data.priceType==='fixed'?parseFloat(data.price):null,
  location_name:data.jobAddress||null,
  location_note:data.locationNote||null,
  latitude:data.latitude||null,
  longitude:data.longitude||null,
  area_polygon:area.length>0?area:null,
  area_hectares:data.areaHectares||null,
  schedule_type:data.scheduleType,
  scheduled_date:data.scheduleType==='specific'&&data.scheduledDate?nzCalendarDay(data.scheduledDate):null,
  date_from:data.scheduleType==='range'&&data.dateFrom?nzCalendarDay(data.dateFrom):null,
  date_to:data.scheduleType==='range'&&data.dateTo?nzCalendarDay(data.dateTo):null,
  materials_type:data.materialsType||null,
  access_conditions:access.length>0?access:null,
  hide_exact_location:!!data.hideExactLocation,
  location_area:(data.locationArea||localityFromAddress(data.jobAddress))||null,
  repeated_from_job_id:data.repeatedFromJobId||null,
  recurrence_frequency:data.recurrenceFrequency||'one_time',
 }
}

// Saving an edit: a column whose wizard value is the one it opened with keeps
// exactly what is stored (an old date format, a blank area, a missing choice).
export function editedJobPayload(data:Row,category:string,job:Row){
 const payload:Row=jobPayload(data,category),opened:Row=jobPayload(jobEditSeed(job),job.category||'')
 for(const key of Object.keys(payload))
  if(JSON.stringify(payload[key])===JSON.stringify(opened[key])){
   if(key in job)payload[key]=job[key]
   else delete payload[key] // not loaded, so not ours to write
  }
 return payload
}

// The private-job save keeps or clears the mapped area itself, so a trace that
// should differ from what it leaves behind is saved separately. Null: nothing to do.
export function privateAreaUpdate(payload:Row,job:Row){
 const same=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null)
 const moved=!['location_name','latitude','longitude'].every(key=>same(payload[key],job[key]))
 const left=moved?null:job.area_polygon
 return same(payload.area_polygon,left)?null:{area_polygon:payload.area_polygon,area_hectares:payload.area_hectares}
}

const centre=(points:Point[])=>points.reduce((sum,p)=>({latitude:sum.latitude+p.latitude/points.length,longitude:sum.longitude+p.longitude/points.length}),{latitude:0,longitude:0})

// Coming back from tracing. A new job's pin follows the traced area, as before. When
// editing, confirming the same area changes nothing, and a pin the member placed
// stays put; only a pin that was the old area's centre moves with it.
export function tracedLocation({editing,points,pin,result}:{editing:boolean;points:Point[];pin:{latitude:unknown;longitude:unknown};
 result:{polygonPoints?:Point[];areaHectares?:unknown;centroid?:Point}}){
 const next=result.polygonPoints||[]
 if(editing&&JSON.stringify(next)===JSON.stringify(points||[]))return null
 const moved={areaPolygon:next,areaHectares:result.areaHectares,pin:result.centroid?.latitude?result.centroid:null}
 if(!editing||!pin.latitude)return moved
 const old=points?.length?centre(points):null
 const followed=!!old&&Math.abs(old.latitude-Number(pin.latitude))<1e-5&&Math.abs(old.longitude-Number(pin.longitude))<1e-5
 return followed?moved:{...moved,pin:null}
}
