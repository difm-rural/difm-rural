// Shared posting limits. Currency inputs are decimal dollars, never exponent notation.
export const MAX_POSTING_AMOUNT = 10_000_000
export function moneyInputError(value:unknown,label='Amount',allowZero=false,optional=false):string{
 const text=String(value??'').trim()
 if(!text&&optional)return ''
 const number=Number(text)
 if(!text||!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)||!Number.isFinite(number)||number>MAX_POSTING_AMOUNT||(allowZero?number<0:number<=0))
  return `${label} must be ${allowZero?'zero or more':'greater than zero'}, no more than $10,000,000, with at most two decimal places.`
 return ''
}
type Row={label?:unknown;amount?:unknown;rate?:unknown;min_charge?:unknown}
export function listingMoneyError(value:{pricingType?:string|null;rate?:unknown;minCharge?:unknown;addOns?:Row[]|null;variants?:Row[]|null}):string{
 if(value.pricingType!=='quote_required'){
  const error=moneyInputError(value.rate,'Rate',true);if(error)return error
 }
 const minimum=moneyInputError(value.minCharge,'Minimum charge',true,true);if(minimum)return minimum
 for(const [index,row] of (value.addOns||[]).entries()){
  if(!String(row.label??'').trim()&&!String(row.amount??'').trim())continue
  const error=moneyInputError(row.amount,`Extra charge ${index+1}`,true);if(error)return error
 }
 for(const [index,row] of (value.variants||[]).entries()){
  if(!String(row.label??'').trim()&&!String(row.rate??'').trim()&&!String(row.min_charge??'').trim())continue
  const error=moneyInputError(row.rate,`Alternate rate ${index+1}`)||moneyInputError(row.min_charge,`Alternate minimum charge ${index+1}`,true,true)
  if(error)return error
 }
 return ''
}
