import {localityFromAddress} from './locality'

// Listing kind determines who supplies location; it does not change lifecycle.
export function bookingLocationPolicy(kind?:string|null) {
 if(kind==='grazing')return {
  source:'provider',bookable:true,collectRequesterLocation:false,required:false,
  label:'Grazing area',inputLabel:'',
  help:'The exact grazing location and access arrangements will be confirmed with the provider.',
 }
 if(kind==='hire')return {
  source:'agreed',bookable:true,collectRequesterLocation:true,required:false,
  label:'Provider’s public area',inputLabel:'Delivery location (optional)',
  help:'Agree collection or delivery with the provider. Add your location only if requesting delivery. The exact collection location and access arrangements will be confirmed with the provider.',
 }
 if(kind==='for_sale'||kind==='lease')return {
  source:kind==='lease'?'provider':'agreed',bookable:false,collectRequesterLocation:false,required:false,
  label:kind==='lease'?'Public area':'Seller’s public area',inputLabel:'',
  help:kind==='lease'?'Use Enquire to agree the exact location, viewing and access arrangements with the provider.':'Use Enquire to agree collection or delivery with the seller. Share a delivery address only if delivery is agreed.',
 }
 return {
  source:'requester',bookable:true,collectRequesterLocation:true,required:true,
  label:'Where is the work needed?',inputLabel:'Your address or property location',
  help:'Enter where the service is needed. Add a pin or arrival directions if helpful.',
 }
}

export function bookingPublicArea(location?:string|null) {
 const area=localityFromAddress(location)
 return area&&!/\b(road|rd|street|avenue|ave|lane|ln|drive|dr|highway|hwy|address)\b/i.test(area)?area:'Area to be confirmed with the provider'
}

export function bookingLocationHelp(kind:string|null|undefined,role:'requester'|'provider') {
 if(kind==='grazing')return role==='provider'
  ? 'Confirm the exact grazing location and access arrangements with the requester.'
  : 'The provider will confirm the exact grazing location and access arrangements.'
 return bookingLocationPolicy(kind).help
}

type LocationInput={location?:unknown;latitude?:unknown;longitude?:unknown;note?:unknown}
// Used by mobile payload creation and the web server action. Grazing ignores
// even forged/stale requester input; the public summary is never an address.
export function bookingLocationFields(kind:string|null|undefined,input:LocationInput={}) {
 const policy=bookingLocationPolicy(kind)
 if(!policy.bookable)throw new Error('Use Enquire to agree arrangements for this listing.')
 if(!policy.collectRequesterLocation)return {location_name:null,latitude:null,longitude:null,location_note:null}
 const location=String(input.location??'').trim(),note=String(input.note??'').trim()
 if(policy.required&&!location)throw new Error('Please enter your location or property address.')
 if(location.length>300)throw new Error('Keep the location to 300 characters.')
 if(note.length>2000)throw new Error('Keep arrival directions to 2,000 characters.')
 const number=(value:unknown)=>value==null||value===''?null:Number(value)
 const latitude=number(input.latitude),longitude=number(input.longitude)
 if((latitude===null)!==(longitude===null)||
   (latitude!==null&&(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude!)>180)))
  throw new Error('Clear the invalid GPS location or choose it again.')
 if(!location&&(latitude!==null||longitude!==null))throw new Error('Add a delivery location or clear the pin.')
 return {location_name:location||null,latitude,longitude,location_note:note||null}
}

