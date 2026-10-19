import { OFFER_PRICING_TYPES, OFFER_MATERIALS_OPTIONS } from '@shared/offers'
export type OfferDetails={amount:number;message:string;line_items:{label:string;amount:number}[];pricing_type:string;materials:string|null;available_from:string|null;estimated_duration:string|null}
export function offerInput(data:FormData,providerMaterials:boolean){
 const text=(key:string)=>String(data.get(key) || '').trim(),labels=data.getAll('item_label').map(String),amounts=data.getAll('item_amount').map(String)
 if(!labels.length || labels.length>12 || labels.length!==amounts.length)return {ok:false as const,error:'Add between one and twelve price lines.'}
 const items=labels.map((label,i)=>({label:label.trim(),amount:Math.round(Number(amounts[i])*100)/100}))
 if(items.some((item,i)=>!item.label||item.label.length>120||!amounts[i].trim()||!Number.isFinite(item.amount)||item.amount<0||item.amount>10000000))return {ok:false as const,error:'Give each price line a description and a valid non-negative amount.'}
 const amount=Math.round(items.reduce((sum,item)=>sum+item.amount,0)*100)/100,message=text('message'),pricing=text('pricing_type'),materials=text('materials'),date=text('available_from'),duration=text('estimated_duration')
 const day=new Date(date+'T12:00:00Z')
 if(amount<=0||amount>10000000||message.length>5000||duration.length>150)return {ok:false as const,error:'Use a positive offer amount, a message up to 5,000 characters and duration up to 150 characters.'}
 if(!OFFER_PRICING_TYPES.some(p=>p.id===pricing)||(providerMaterials&&!OFFER_MATERIALS_OPTIONS.some(m=>m.id===materials)))return {ok:false as const,error:'Choose a pricing basis and materials option.'}
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(day.getTime())||day.toISOString().slice(0,10)!==date))return {ok:false as const,error:'Choose a valid availability date or leave it blank.'}
 return {ok:true as const,value:{amount,message,line_items:items.map(i=>({...i,amount:Math.round(i.amount*100)/100})),pricing_type:pricing,materials:providerMaterials?materials:null,available_from:date||null,estimated_duration:duration||null}}
}
