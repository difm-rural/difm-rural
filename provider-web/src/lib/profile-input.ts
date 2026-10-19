import { ALL_CAPABILITIES, CATEGORIES } from '@shared/categories'
import { PROVIDER_AVAILABILITY_OPTIONS } from '@shared/providerAvailability'

export const PUBLIC_PROFILE_COLUMNS='id,full_name,display_name,avatar_url,bio,skills,qualifications,region,created_at,availability_status,availability_until,availability_updated_at'
export const PRIVATE_PROFILE_COLUMNS=PUBLIC_PROFILE_COLUMNS+',phone,address,latitude,longitude'
type Validation<T>={ok:true;value:T}|{ok:false;error:string}
const text=(data:FormData,key:string)=>typeof data.get(key)==='string'?String(data.get(key)).trim():''
export function profileInput(data:FormData,current:{avatar_url?:string|null;skills?:string[]|null},userId:string,baseUrl:string){
  const name=text(data,'full_name'),region=text(data,'region'),phone=text(data,'phone'),bio=text(data,'bio'),address=text(data,'address'),avatar=text(data,'avatar_url')
  if(!name || name.length>80)return {ok:false as const,error:'Add a public name of up to 80 characters.'}
  if(!region || region.length>120)return {ok:false as const,error:'Add your public town or region (up to 120 characters).'}
  if(bio.length>1500 || address.length>300)return {ok:false as const,error:'Keep your bio to 1,500 characters and your address to 300 characters.'}
  if(phone && (!/^[+\d\s().-]+$/.test(phone) || phone.replace(/\D/g,'').length<7 || phone.replace(/\D/g,'').length>15))return {ok:false as const,error:'Enter a valid phone number, including area code, or leave it blank.'}
  const qualifications=[...new Set(text(data,'qualifications').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))]
  if(qualifications.length>12 || qualifications.some(q=>q.length>160))return {ok:false as const,error:'Use up to 12 qualifications, one per line, with up to 160 characters each.'}
  const skills=[...new Set(data.getAll('skills').filter((s):s is string=>typeof s==='string'))]
  const allowed=new Set([...ALL_CAPABILITIES,...(current.skills || [])])
  if(skills.some(s=>!allowed.has(s)))return {ok:false as const,error:'Choose skills from the available capabilities.'}
  const lat=text(data,'latitude'),lng=text(data,'longitude')
  if((!!lat)!=(!!lng) || (lat && (!Number.isFinite(Number(lat)) || Math.abs(Number(lat))>90 || !Number.isFinite(Number(lng)) || Math.abs(Number(lng))>180)))return {ok:false as const,error:'The map location is invalid. Choose your location again or clear it.'}
  if(avatar && avatar!==current.avatar_url){
    try{if(!new URL(avatar).href.startsWith(baseUrl+'/storage/v1/object/public/avatars/'+userId+'/'))return {ok:false as const,error:'Choose a profile photo to upload again.'}}catch{return {ok:false as const,error:'Choose a valid profile photo.'}}
  }
  return {ok:true as const,value:{full_name:name,display_name:name,region,phone:phone || null,bio:bio || null,address:address || null,
    latitude:lat?Number(lat):null,longitude:lng?Number(lng):null,skills,qualifications,avatar_url:avatar || null}}
}
export function nzToday(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
  const get=(key:string)=>parts.find(p=>p.type===key)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function availabilityInput(data:FormData,now=new Date()):Validation<{availability_status:string;availability_until:string|null;availability_updated_at:string}>{
  const status=text(data,'availability_status'),until=text(data,'availability_until')
  if(status!=='unknown' && !PROVIDER_AVAILABILITY_OPTIONS.some(o=>o.value===status))return {ok:false,error:'Choose an availability option.'}
  if(status==='unavailable_until'){
    const date=new Date(until+'T12:00:00Z')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==until || until<nzToday(now))return {ok:false,error:'Choose today or a future date for your unavailable-until date.'}
  }
  return {ok:true,value:{availability_status:status,availability_until:status==='unavailable_until'?until:null,availability_updated_at:now.toISOString()}}
}
export const EMAIL_OPTIONS=[
  {key:'email_transactional',label:'Booking and job updates',description:'Important updates about your jobs, offers and bookings.'},
  {key:'email_messages',label:'Message emails',description:'Email reminders about messages.'},
  {key:'email_seasonal',label:'Seasonal emails',description:'Occasional rural reminders and seasonal tips.'},
  {key:'daily_digest',label:'Daily summary',description:'A daily summary of activity and opportunities.'},
] as const
export function preferencesInput(data:FormData){
  const mode=text(data,'opportunity_alert_mode'),radius=Number(text(data,'opportunity_radius_km'))
  if(!['off','daily','instant'].includes(mode) || ![15,30,50,100].includes(radius))return {ok:false as const,error:'Choose a job alert frequency and travel area.'}
  const categories=[...new Set(data.getAll('preferred_categories').filter((s):s is string=>typeof s==='string'))]
  if(categories.some(c=>!CATEGORIES.includes(c)))return {ok:false as const,error:'Choose job interests from the available categories.'}
  const checked=(key:string)=>data.get(key)==='on'
  return {ok:true as const,value:{email_transactional:checked('email_transactional'),email_messages:checked('email_messages'),email_seasonal:checked('email_seasonal'),daily_digest:checked('daily_digest'),
    opportunity_alert_mode:mode,opportunity_radius_km:radius,opportunity_push:checked('opportunity_push'),opportunity_email:checked('opportunity_email'),preferred_categories:categories}}
}
