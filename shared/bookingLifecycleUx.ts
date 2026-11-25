import {bookingDurationSummary} from './bookingDuration'
import {readableRate,quantityUnit} from './findLocalHelp'
export const BOOKING_ACCEPTED={title:'Booking accepted',message:'The requester has been notified. Use Chat to agree the remaining arrangements.'}
export const GRAZING_CONFIRMED={title:'Grazing booking confirmed',message:'Use Chat to agree the grazing dates, duration, access and payment arrangements.'}
export const GRAZING_COMPLETION={title:'Complete grazing arrangement?',message:'Confirm that the grazing arrangement has finished.',payment:'Payment is arranged directly between requester and provider. Completing the booking does not collect or record payment.',
 relist:'Finish the selected booking and make the grazing listing available for new booking requests.',
 close:'Finish the selected booking and close the listing to new requests.'}
type Booking=Parameters<typeof bookingDurationSummary>[0]
export function savedBookingSummary(booking:Booking){
 const snapshot=booking.pricing_snapshot as {version?:number;pricing_type?:string;rate?:number|null;unit_label?:string|null;min_charge?:number|null}|null
 const saved=snapshot?.version===1&&snapshot.pricing_type&&'rate' in snapshot&&'unit_label' in snapshot?snapshot:null,service=booking.service||booking.services
 const unit=saved?.unit_label||(service?.kind==='grazing'?'head':'unit'),quantity=booking.quantity??1
 return {...bookingDurationSummary({...booking,pricing_snapshot:saved}),quantityLabel:`${quantity} ${quantityUnit(unit,quantity)}`,
  unitRate:saved?readableRate(saved.pricing_type||'',saved.rate,saved.unit_label,saved.min_charge):'Not recorded'}
}
export function bookingAcceptanceMessage(booking:Booking,requester:string){
 const s=savedBookingSummary(booking)
 return `Requester: ${requester}\nQuantity: ${s.quantityLabel}\nRate: ${s.unitRate}\nExpected duration: ${s.duration}\nEstimated total: ${s.totalLabel}\n\nYou are accepting the booking request, not confirming final payment. Use Chat to agree the remaining arrangements.`
}
export function grazingCompletionFeedback(relist:boolean){return {title:'Grazing booking completed',message:(relist?'The booking is complete and your listing is available for new requests.':'The booking is complete and your listing is now closed.')+' Both parties can leave reviews.'}}
export function consumeBookingSent(storage:{getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void},id:string){
 try{const key='rc:booking-sent:'+id;if(storage.getItem(key))return false;storage.setItem(key,'1');return true}catch{return true}
}
