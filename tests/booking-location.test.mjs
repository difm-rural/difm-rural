import test from 'node:test'
import assert from 'node:assert/strict'
import {bookingLocationPolicy as policy,bookingLocationFields as fields,bookingPublicArea} from '../shared/bookingLocation.ts'
import {openBooking} from './support/booking-confirm-screen.mjs'
const service={id:'listing',provider_id:'provider',title:'Winter grazing',kind:'grazing',pricing_type:'fixed',rate:50,location_name:'Cambridge',profile:{full_name:'Provider'}}
test('location ownership follows existing listing kinds without adding booking flows',()=>{
 assert.equal(policy('grazing').collectRequesterLocation,false)
 assert.equal(policy('service').required,true)
 assert.equal(policy('hire').required,false)
 for(const kind of ['for_sale','lease']){assert.equal(policy(kind).bookable,false);assert.throws(()=>fields(kind),/Enquire/)}
})
test('grazing discards stale or forged requester fields; public summary excludes private address',()=>{
 assert.deepEqual(fields('grazing',{location:'Private address',latitude:'bad',longitude:999,note:'Private directions'}),{location_name:null,latitude:null,longitude:null,location_note:null})
 assert.equal(bookingPublicArea('123 Example Road, Cambridge 3434, New Zealand'),'Cambridge')
 for(const value of [null,'123 Example Road','PRIVATE STREET ADDRESS'])assert.match(bookingPublicArea(value),/confirmed/)
})
test('service keeps required requester location and optional pin, including zero coordinates',()=>{
 assert.throws(()=>fields('service'),/enter your location/)
 assert.deepEqual(fields('service',{location:' Farm ',latitude:0,longitude:0,note:' Gate '}),{location_name:'Farm',latitude:0,longitude:0,location_note:'Gate'})
 for(const input of [{location:'Farm',latitude:91,longitude:1},{location:'Farm',latitude:1}])assert.throws(()=>fields('service',input),/GPS/)
})
test('hire allows collection without an address and validates optional delivery fields',()=>{
 assert.equal(fields('hire').location_name,null)
 assert.equal(fields('hire',{location:'Delivery farm',latitude:-41,longitude:174}).latitude,-41)
 assert.throws(()=>fields('hire',{latitude:-41,longitude:174}),/delivery location/)
})
test('native grazing form shows public area and explanation without address or pin collection',async()=>{
 const screen=openBooking({service});assert.equal(screen.find('AddressAutocomplete'),undefined)
 assert.match(screen.texts(),/Cambridge/);assert.match(screen.texts(),/exact grazing location and access arrangements/)
 assert.equal(screen.log.writes.length,0)
 await screen.press('Send booking request');assert.equal(screen.log.writes.length,1)
 const row=screen.log.writes[0].payload;assert.equal(row.location_name,null);assert.equal(row.latitude,null);assert.equal(row.location_note,null)
})
test('native service still blocks missing address; hire does not require one',async()=>{
 const site=openBooking({service:{...service,kind:'service'}});assert.ok(site.find('AddressAutocomplete'))
 await site.press('Send booking request');assert.equal(site.log.writes.length,0)
 site.find('AddressAutocomplete').props.onChangeText('Requester farm');await site.press('Send booking request');assert.equal(site.log.writes[0].payload.location_name,'Requester farm')
 const hire=openBooking({service:{...service,kind:'hire'}});assert.ok(hire.find('AddressAutocomplete'));await hire.press('Send booking request');assert.equal(hire.log.writes[0].payload.location_name,null)
})
