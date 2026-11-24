import {LISTING_CATEGORIES} from './categories'
import {formatRate} from './listingPricing'
export const HELP_FILTERS=[['','All'],['service','Services'],['grazing','Grazing'],['hire','Equipment'],['for_sale','Goods']] as const
// Stored kinds/categories stay unchanged; land leases appear with grazing, storage with services.
export function matchesHelpFilter(item:{kind?:string|null;category?:string|null},filter:string){
 const kind=item.kind || (['grazing','hire','lease','for_sale'].find(key=>LISTING_CATEGORIES[key as keyof typeof LISTING_CATEGORIES].includes(item.category || '')) ?? 'service')
 const group=kind==='lease'?(item.category==='Paddock/land'?'grazing':'service'):kind
 return !filter || (filter==='lease'?kind==='lease':group===filter)
}
export function matchesListingSearch(item:{title?:string|null;description?:string|null;category?:string|null;location_name?:string|null},query:string){
 const q=query.trim().toLocaleLowerCase('en-NZ')
 return !q || [item.title,item.description,item.category,item.location_name].some(v=>String(v || '').toLocaleLowerCase('en-NZ').includes(q))
}
export function readableRate(pricingType:string,rate:unknown,unit?:string|null,min?:unknown){
 return formatRate(pricingType,rate as string,unit,min as string).replace('/head/week',' per head per week').replace('/head/month',' per head per month')
}
export function bookingSuccess(provider?:string|null){return {title:'Booking request sent!',message:`Your request has been sent to ${provider || 'the provider'}. They'll review it and respond.`}}
// A stable ID and a synchronous lock survive double taps and uncertain retries.
export function bookingSubmission(){let busy=false,complete=false;return {
 start(){if(busy||complete)return false;busy=true;return true},
 finish(success:boolean){busy=false;if(success)complete=true},
}}

export function quantityUnit(unit:string,quantity:number){
 if(/^head\/(week|month)$/.test(unit))return 'head'
 if(['ha','each'].includes(unit)||unit.includes('/'))return unit
 return unit+(quantity===1||unit.endsWith('s')?'':'s')
}
