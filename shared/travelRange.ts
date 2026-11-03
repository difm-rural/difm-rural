export const MAX_TRAVEL_RANGE_KM = 2000
export function travelRangeError(value:unknown):string{
 const text=String(value??'').trim()
 if(!text)return ''
 const km=Number(text)
 return /^\d+$/.test(text)&&Number.isSafeInteger(km)&&km<=MAX_TRAVEL_RANGE_KM?'':'Enter a whole number from 0 to 2,000 km, or leave travel range blank.'
}
export function travelRangeValue(value:unknown):number|null{
 if(travelRangeError(value))throw new Error(travelRangeError(value))
 const text=String(value??'').trim()
 return text?Number(text):null
}
