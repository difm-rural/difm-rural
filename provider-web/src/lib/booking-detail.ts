import {bookingEstimate,type BookingRate} from './booking-estimate'
import type {VariantDraft,AddOnDraft} from '@shared/listingPricing'
export type PricingListing=BookingRate & {pricing_variants?:VariantDraft[]|null;pricing_add_ons?:AddOnDraft[]|null;pricing_terms?:string|null;payment_timing?:string|null;materials?:string|null}
export type PricingSnapshot={version:1;option_label:string|null;pricing_type:string;rate:number|null;unit_label:string|null;minimum_units:number;min_charge:number;quantity:number;base_amount:number|null;pricing_terms:string|null;pricing_add_ons:AddOnDraft[];payment_timing:string|null;materials:string|null}
export function selectedRate(s:PricingListing,index:string|null|undefined){
 if(index==null||index==='')return {rate:s,label:null,index:null}
 if(!/^\d+$/.test(index))throw new Error('Choose a valid rate option.')
 const variant=s.pricing_variants?.[Number(index)]
 if(!variant||!variant.label||!['fixed','hourly','day_rate','per_unit'].includes(variant.pricing_type || '')||!Number.isFinite(Number(variant.rate))||Number(variant.rate)<=0)throw new Error('This rate option is unavailable. Choose another option.')
 return {rate:{...s,pricing_type:variant.pricing_type!,rate:Number(variant.rate),unit_label:variant.unit_label || null,minimum_units:Number(variant.min_units)||1,min_charge:Number(variant.min_charge)||0},label:variant.label,index:Number(index)}
}
export function pricingRevision(s:PricingListing){return JSON.stringify([s.kind,s.pricing_type,s.rate,s.unit_label,s.minimum_units,s.min_charge,s.max_units,s.pricing_variants || [],s.pricing_add_ons || [],s.pricing_terms,s.payment_timing,s.materials])}
export function pricingSnapshot(s:PricingListing,index:string|null|undefined,quantity:number):PricingSnapshot{
 const choice=selectedRate(s,index),r=choice.rate,estimate=bookingEstimate(r,quantity)
 if(estimate.amount!==null&&(!Number.isFinite(estimate.amount)||estimate.amount<=0))throw new Error('This listing needs a valid rate before it can take requests.')
 return {version:1,option_label:choice.label,pricing_type:r.pricing_type,rate:r.rate,unit_label:r.unit_label || null,minimum_units:Math.max(1,r.minimum_units || 1),min_charge:Number(r.min_charge) || 0,quantity:estimate.quantity,base_amount:estimate.amount,pricing_terms:s.pricing_terms || null,pricing_add_ons:(s.pricing_add_ons || []).map(a=>({...a})),payment_timing:s.payment_timing || null,materials:s.materials || null}
}
export function readPricingSnapshot(value:unknown):PricingSnapshot|null{
 if(!value||typeof value!=='object')return null
 const v=value as PricingSnapshot
 const nullableString=(value:unknown)=>value===null||typeof value==='string'
 return v.version===1&&['fixed','hourly','day_rate','per_unit','quote_required'].includes(v.pricing_type)&&Number.isFinite(v.quantity)&&v.quantity>0&&(v.base_amount===null||(Number.isFinite(v.base_amount)&&v.base_amount>=0))&&(v.rate===null||Number.isFinite(v.rate))&&Number.isFinite(v.minimum_units)&&Number.isFinite(v.min_charge)&&[v.option_label,v.unit_label,v.pricing_terms,v.payment_timing,v.materials].every(nullableString)&&Array.isArray(v.pricing_add_ons)&&v.pricing_add_ons.length<=50&&v.pricing_add_ons.every(a=>a&&typeof a==='object'&&[a.label,a.basis,a.unit_label].every(field=>field===undefined||typeof field==='string')&&(a.amount===undefined||typeof a.amount==='string'||typeof a.amount==='number'))?v:null
}
export function unitName(s:{pricing_type?:string;unit_label?:string|null}){return s.pricing_type==='hourly'?'hours':s.pricing_type==='day_rate'?'days':s.unit_label || 'units'}
export function paymentCopy(s:{kind?:string|null;unit_label?:string|null;payment_timing?:string|null;materials?:string|null}){
 const base=s.kind==='for_sale'?'Agree payment directly with the seller.':s.kind==='grazing'||s.kind==='lease'?'Agree the duration and payment schedule directly with the provider.':s.payment_timing==='upfront'?'The provider asks for payment upfront. Agree the arrangements directly.':'Arrange payment directly with the provider when the work is complete.'
 return base+(s.materials==='estimate'?' Materials are estimated and billed separately at actual cost.':'')+' Rural Connections does not handle payments.'
}
export type BookingResponse={id:string;status:string;requester_id:string;provider_id:string;quote_amount:number|null;quote_notes?:string|null;quote_sent_at:string|null;pricing_snapshot?:unknown}
export function bookingResponseActions(b:BookingResponse,userId:string,pricingType:string){
 const quote=(readPricingSnapshot(b.pricing_snapshot)?.pricing_type || pricingType)==='quote_required'
 if(b.provider_id===userId){
  const canQuote=quote&&(['pending','quote_sent'].includes(b.status)||(b.status==='confirmed'&&b.quote_amount==null&&!b.quote_sent_at))
  return [...(canQuote?['quote']:[]),...(!quote&&b.status==='pending'?['confirm']:[]),...(['pending','quote_sent'].includes(b.status)?['decline']:[])]
 }
 return b.requester_id===userId&&b.status==='quote_sent'&&b.quote_amount!=null?['accept']:[]
}
export function bookingNextStep(status:string,role:'requester'|'provider',quote:boolean,kind?:string|null){
 if(status==='pending')return role==='provider'?(quote?'Review the request and send a quote for the requester to approve.':'Review the request, then accept or decline it.'):'Your request is waiting for the provider. It is confirmed when they accept or you accept their quote.'
 if(status==='quote_sent')return role==='provider'?'Your quote is waiting for the requester to accept.':'Review the quote amount and what is included. Accepting confirms the booking.'
 if(['confirmed','in_progress'].includes(status))return kind==='grazing'?'Arrangement accepted. Use Chat to agree ongoing dates, details and payment. When it finishes, the provider can complete it and close or relist the listing.':'Booking confirmed. Use Chat to agree timing, access, details and direct payment. The provider marks it complete when the work is finished.'
 if(status==='cancellation_requested')return 'Cancellation requested. The arrangement remains active until the provider confirms cancellation.'
 if(status==='completed')return 'Arrangement complete. Both people can leave a review.'
 return 'This request is closed. You can find it again in Activity History.'
}

export type BookingRecord=BookingResponse & {service_id:string;quantity:number;total_amount:number;payment_timing:string|null;scheduled_date:string|null;location_name:string|null;latitude:number|null;longitude:number|null;location_note:string|null;notes:string|null;created_at:string;quote_accepted_at:string|null;service:(PricingListing & {id:string;title:string;closed_at:string|null;is_active:boolean;kind?:string|null})|null}
