import {listingEstimate,type EstimateListing,type EstimateOption} from './listingEstimate'
import {formatMoney} from './formatting.js'
export type DurationUnit='hour'|'day'|'week'|'month'
export const GRAZING_WEEKS=[1,2,4,6,8] as const
export const DURATION_AGREEMENT='Final dates, duration and payment arrangements are agreed directly between requester and provider.'
type Rate=EstimateListing & {pricing_terms?:string|null;pricing_add_ons?:unknown[]|null;payment_timing?:string|null;materials?:string|null}
export function pricingPeriod(rate:EstimateListing|null|undefined):DurationUnit|null{
 if(rate?.pricing_type==='hourly')return 'hour'
 if(rate?.pricing_type==='day_rate')return 'day'
 if(rate?.pricing_type!=='per_unit')return null
 return /^(?:[^/]+\/)?(hour|day|week|month)s?$/.exec((rate.unit_label||'').trim().toLowerCase())?.[1] as DurationUnit||null
}
export function durationPolicy(rate:EstimateListing){
 const period=pricingPeriod(rate),enabled=['grazing','hire','service'].includes(rate.kind||'service')&&(rate.kind==='grazing'||!!period)
 const quantityIsTime=rate.pricing_type==='hourly'||rate.pricing_type==='day_rate'||(rate.pricing_type==='per_unit'&&/^(hour|day|week|month)s?$/.test((rate.unit_label||'').trim().toLowerCase()))
 return {enabled,period,unit:rate.kind==='grazing'?'week' as DurationUnit:period,quantityIsTime:rate.kind!=='grazing'&&quantityIsTime}
}
export function durationFields(rate:EstimateListing,value:unknown,unit:unknown,quantity?:number){
 if(value==null||value===''){
  if(unit!=null&&unit!=='')throw new Error('Choose a duration and its unit together.')
  return {expected_duration:null,expected_duration_unit:null}
 }
 const policy=durationPolicy(rate),number=Number(value)
 if(!['number','string'].includes(typeof value)||!/^\d+(?:\.\d{1,2})?$/.test(String(value).trim()))throw new Error('Choose a positive numeric duration with at most two decimal places.')
 if(!policy.enabled||unit!==policy.unit||!Number.isFinite(number)||number<=0||number>10000||Math.abs(number*100-Math.round(number*100))>0.000001)
  throw new Error('Choose a valid expected duration in the advertised time unit (up to 10,000, with at most two decimal places).')
 if(rate.kind==='grazing'&&!GRAZING_WEEKS.some(v=>v===number))throw new Error('Choose 1, 2, 4, 6 or 8 weeks, or Not sure yet.')
 if(policy.quantityIsTime&&number<Math.max(1,Number(rate.minimum_units)||1))throw new Error('Expected duration is below the advertised minimum quantity.')
 if(policy.quantityIsTime&&quantity!==undefined&&number!==quantity)throw new Error('Time quantity must match expected duration.')
 return {expected_duration:number,expected_duration_unit:policy.unit}
}
export function validateGrazingQuantity(rate:EstimateListing,quantity:number){
 if(rate.kind==='grazing'&&(!Number.isInteger(quantity)||quantity<1||(rate.max_units!=null&&quantity>rate.max_units)))
  throw new Error('Choose a whole number of animals within the listing capacity.')
}
export function durationLabel(value:unknown,unit:unknown){
 const number=Number(value)
 return value!=null&&value!==''&&Number.isFinite(number)&&number>0&&['hour','day','week','month'].includes(String(unit))?`${number} ${unit}${number===1?'':'s'}`:'To be agreed'
}
// Pure time quantities (hours/days/weeks) already represent duration. Per-item
// period rates (head/week, machine/day) multiply their base period estimate once.
export function durationEstimate(rate:EstimateListing,quantity:number,value:unknown,unit:unknown){
 const period=pricingPeriod(rate),policy=durationPolicy(rate),base=listingEstimate(rate,null,quantity)
 const periodAmount=rate.rate==null||!Number.isFinite(Number(rate.rate))?null:policy.quantityIsTime?Number(rate.rate):Number((base.quantity*Number(rate.rate)).toFixed(2))
 const duration=value==null||value===''?null:Number(value)
 const valid=duration!==null&&Number.isFinite(duration)&&duration>0&&unit===period
 const total=valid&&periodAmount!==null&&Number.isFinite(periodAmount)?Number(Math.max(periodAmount*duration,Number(rate.min_charge)||0).toFixed(2)):null
 return {period,periodAmount:rate.pricing_type==='quote_required'?null:periodAmount,total:rate.pricing_type==='quote_required'?null:total}
}
export function bookingDurationSummary(booking:{quantity?:number;total_amount?:number;expected_duration?:number|string|null;expected_duration_unit?:string|null;pricing_snapshot?:unknown;service?:Rate|null;services?:Rate|null}){
 const service=booking.service||booking.services||{},snapshot=booking.pricing_snapshot as (Rate & {version?:number;base_amount?:number|null})|null
 const rate=snapshot?.version===1?{...service,...snapshot}:service
 const estimate=durationEstimate(rate,Number(booking.quantity)||1,booking.expected_duration,booking.expected_duration_unit)
 // Without a saved rate, a current listing edit cannot be presented as historical terms.
 if(snapshot?.version!==1){estimate.periodAmount=null;estimate.total=null}
 return {duration:durationLabel(booking.expected_duration,booking.expected_duration_unit),...estimate,
  periodLabel:estimate.period?`Estimated ${({'hour':'hourly','day':'daily','week':'weekly','month':'monthly'} as const)[estimate.period]} cost`:'Estimated period cost',
  totalLabel:estimate.total===null?'To be agreed':formatMoney(estimate.total)}
}
// Same version-1 shape already used by provider web; new mobile requests now
// also freeze advertised rates, so later listing edits do not change estimates.
export function mobilePricingSnapshot(service:Rate,option:EstimateOption|null,quantity:number){
 const r=option||service,e=listingEstimate(service,option,quantity)
 return {version:1,kind:service.kind||'service',option_label:(option as {label?:string}|null)?.label||null,pricing_type:r.pricing_type,rate:r.rate==null?null:Number(r.rate),unit_label:r.unit_label||null,
  minimum_units:e.minimumUnits,min_charge:e.minimumCharge,quantity:e.quantity,base_amount:e.baseAmount,pricing_terms:service.pricing_terms||null,
  pricing_add_ons:(service.pricing_add_ons||[]).map(v=>v&&typeof v==='object'?{...v}:v),payment_timing:service.payment_timing||null,materials:service.materials||null}
}
