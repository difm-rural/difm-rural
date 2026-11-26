import { OFFER_PRICING_TYPES, OFFER_MATERIALS_OPTIONS } from '@shared/offers'
import { parseNzDate } from '@shared/dates'
import { nzToday } from '@shared/postingDates'
export type OfferDetails={amount:number;message:string;line_items:{label:string;amount:number}[];pricing_type:string;materials:string|null;available_from:string|null;available_time:string|null;estimated_duration:string|null}
export function offerInput(data:FormData,providerMaterials:boolean,savedAvailable?:string|null){
 const text=(key:string)=>String(data.get(key) || '').trim(),labels=data.getAll('item_label').map(String),amounts=data.getAll('item_amount').map(String)
 if(!labels.length || labels.length>12 || labels.length!==amounts.length)return {ok:false as const,error:'Add between one and twelve price lines.'}
 const items=labels.map((label,i)=>({label:label.trim(),amount:Math.round(Number(amounts[i])*100)/100}))
 if(items.some((item,i)=>!item.label||item.label.length>120||!amounts[i].trim()||!Number.isFinite(item.amount)||item.amount<0||item.amount>10000000))return {ok:false as const,error:'Give each price line a description and a valid non-negative amount.'}
 const amount=Math.round(items.reduce((sum,item)=>sum+item.amount,0)*100)/100,message=text('message'),pricing=text('pricing_type'),materials=text('materials'),date=text('available_from'),time=text('available_time'),duration=text('estimated_duration')
 const isoDate=date?parseNzDate(date):null
 if(amount<=0||amount>10000000||message.length>5000||duration.length>150)return {ok:false as const,error:'Use a positive offer amount, a message up to 5,000 characters and duration up to 150 characters.'}
 if(!OFFER_PRICING_TYPES.some(p=>p.id===pricing)||(providerMaterials&&!OFFER_MATERIALS_OPTIONS.some(m=>m.id===materials)))return {ok:false as const,error:'Choose a pricing basis and materials option.'}
 if(date&&!isoDate)return {ok:false as const,error:'Available from needs a real date, e.g. 11/11/2026.'}
 if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return {ok:false as const,error:'Choose a valid start time, e.g. 9:00 am.'}
 if(time&&!isoDate)return {ok:false as const,error:'Choose an Available from date to go with the start time.'}
 if(isoDate&&isoDate!==savedAvailable&&isoDate<nzToday())return {ok:false as const,error:"Available from can't be in the past."}
 return {ok:true as const,value:{amount,message,line_items:items.map(i=>({...i,amount:Math.round(i.amount*100)/100})),pricing_type:pricing,materials:providerMaterials?materials:null,available_from:isoDate,available_time:isoDate&&time?time:null,estimated_duration:duration||null}}
}
