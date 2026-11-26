import {formatWorkDateTime} from './formatting.js'
import {formatOfferAvailability} from './offers'

// What has been agreed for an accepted job. `arrival` is the provider's
// confirmed arrival (work_schedules); until they confirm, `proposedStart` is
// the day their accepted offer said they could start, so the agreed timing is
// never missing between acceptance and confirmation.
export function agreedJobDetails(arrival?:string|null,duration?:string|null,availableFrom?:string|null){
 const dateTime=arrival?formatWorkDateTime(arrival):'—'
 const confirmed=dateTime==='—'?null:dateTime
 const proposed=!confirmed&&availableFrom?formatOfferAvailability(availableFrom):''
 return {
  arrival:confirmed,
  proposedStart:proposed&&proposed!=='—'?proposed:null,
  duration:duration?.trim() || null,
 }
}
