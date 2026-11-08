import {publicAreaError} from '@shared/publicArea'
import {localityFromAddress} from '@shared/locality'
import {postingTextError} from '@shared/postingText'
import {moneyInputError} from '@shared/postingMoney'
import {jobScheduleError,type JobSchedule} from '@shared/postingDates'
export const SCHEDULES={asap:'As soon as possible',specific:'On a specific date',range:'Over a date range',flexible:'Flexible timing'}
export const MATERIALS={none:'No materials needed',requester:'I supply materials',provider:'Provider to supply'}
export const ACCESS={park_and_walk:'Park and walk in','4wd_required':'4WD required',dogs_on_property:'Dogs on property',livestock_nearby:'Livestock nearby',electric_fences:'Electric fences',contact_before_arrival:'Contact before arrival'}
export const JOB_EDITOR_COLUMNS='id,requester_id,status,title,description,category,price_type,price,location_name,location_area,hide_exact_location,latitude,longitude,location_note,schedule_type,scheduled_date,date_from,date_to,materials_type,access_conditions,photos,area_polygon,area_hectares,recurrence_frequency,visibility,repeated_from_job_id'
export const validId=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
export type JobSeed={id:string;status:string;title:string;description:string;category:string;price_type:string;price:number|null;location_name:string|null;location_area:string|null;hide_exact_location:boolean;latitude:number|null;longitude:number|null;location_note:string|null;schedule_type:string|null;scheduled_date:string|null;date_from:string|null;date_to:string|null;materials_type:string|null;access_conditions:string[]|null;photos:string[]|null}
export function repeatSeed(job:JobSeed):JobSeed{return {...job,schedule_type:'flexible',scheduled_date:null,date_from:null,date_to:null}}
const text=(d:FormData,k:string)=>String(d.get(k) || '').trim()
export function jobInput(d:FormData,context:{userId:string;jobId:string;baseUrl:string;existingPhotos?:string[];existingAccess?:string[];existingSchedule?:JobSchedule|null;now?:Date}){
 const title=text(d,'title'),description=text(d,'description'),location=text(d,'location'),area=text(d,'area'),note=text(d,'location_note')
 if(!title || postingTextError(title,'title'))return {ok:false as const,error:postingTextError(title,'title')||'Enter a job title.'}
 if(!description || postingTextError(description,'description'))return {ok:false as const,error:postingTextError(description,'description')||'Enter a job description.'}
 if(publicAreaError(area,false))return {ok:false as const,error:publicAreaError(area,false)}
 if(location.length>300)return {ok:false as const,error:'Keep the exact property location to 300 characters or fewer.'}
 if(note.length>2000)return {ok:false as const,error:'Keep the location note to 2,000 characters or fewer.'}
 const priceType=text(d,'price_type'),price=Number(text(d,'price'))
 if(!['fixed','open'].includes(priceType))return {ok:false as const,error:'Choose a fixed budget or Open to offers.'}
 const moneyError=priceType==='fixed'?moneyInputError(text(d,'price'),'Budget'):''
 if(moneyError)return {ok:false as const,error:moneyError}
 const schedule=text(d,'schedule_type'),date=text(d,'scheduled_date'),from=text(d,'date_from'),to=text(d,'date_to')
 const dateError=jobScheduleError({schedule_type:schedule,scheduled_date:date,date_from:from,date_to:to},context.existingSchedule,context.now)
 if(dateError)return {ok:false as const,error:dateError}
 const lat=text(d,'latitude'),lng=text(d,'longitude')
 if(!!lat!==!!lng||(lat&&(!Number.isFinite(Number(lat))||Math.abs(Number(lat))>90||!Number.isFinite(Number(lng))||Math.abs(Number(lng))>180)))return {ok:false as const,error:'Choose a valid map location or clear the GPS location.'}
 const materials=text(d,'materials_type'),access=[...new Set(d.getAll('access_conditions').map(String))]
 if(!(Object.hasOwn(MATERIALS,materials))||access.some(a=>!(Object.hasOwn(ACCESS,a))&&!context.existingAccess?.includes(a)))return {ok:false as const,error:'Choose materials and access options from the list.'}
 const photos=[...new Set(d.getAll('photos').map(String))]
 const root=context.baseUrl+'/storage/v1/object/public/job-photos/'+context.jobId+'/'+context.userId+'/'
 if(photos.length>6||photos.some(photo=>{if(context.existingPhotos?.includes(photo))return false;try{return !new URL(photo).href.startsWith(root)}catch{return true}}))return {ok:false as const,error:'Choose up to six job photos to upload again.'}
 return {ok:true as const,value:{title,description,price_type:priceType,price:priceType==='fixed'?price:null,location_name:location||null,location_area:(area||localityFromAddress(location))||null,location_note:note||null,hide_exact_location:d.get('hide_exact_location')==='on',latitude:lat?Number(lat):null,longitude:lng?Number(lng):null,schedule_type:schedule,scheduled_date:schedule==='specific'?date:null,date_from:schedule==='range'?from:null,date_to:schedule==='range'?to:null,materials_type:materials,access_conditions:access,photos}}
}
export function jobOwnerActions(status:string,offerCount:number){return {edit:status==='open',repeat:['completed','cancelled'].includes(status),delete:(status==='open'&&offerCount===0)||status==='cancelled'}}
