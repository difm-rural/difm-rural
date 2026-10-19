import assert from 'node:assert/strict'
import test from 'node:test'
import { bookingEstimate } from '../provider-web/src/lib/booking-estimate.ts'
import { messagePreview, notificationHref, statusLabel } from '../provider-web/src/lib/work.ts'

test('web booking review includes minimums, grazing capacity and one-off fixed pricing',()=>{
  assert.deepEqual(bookingEstimate({pricing_type:'hourly',rate:50,min_charge:150},1),{quantity:1,amount:150})
  assert.deepEqual(bookingEstimate({pricing_type:'fixed',rate:50},10),{quantity:1,amount:50})
  assert.deepEqual(bookingEstimate({pricing_type:'per_unit',kind:'grazing',unit_label:'head/week',max_units:20,rate:10},30),{quantity:20,amount:200})
  assert.deepEqual(bookingEstimate({pricing_type:'per_unit',minimum_units:3,rate:10},1),{quantity:3,amount:30})
  assert.equal(bookingEstimate({pricing_type:'quote_required',rate:0},1).amount,null)
})
test('Home notifications reopen their specific job, booking or enquiry conversation',()=>{
  assert.equal(notificationHref({type:'new_message',metadata:{booking_id:'b',service_id:'s'}}),'/activity/booking/b')
  assert.equal(notificationHref({type:'new_message',metadata:{job_id:'j'}}),'/activity/job/j')
  assert.equal(notificationHref({type:'new_message',metadata:{service_id:'s',sender_id:'p'}}),'/messages?kind=listing&id=s&person=p')
  assert.equal(notificationHref({type:'new_booking',metadata:{booking_id:'b'}}),'/activity/booking/b/manage')
  assert.equal(notificationHref({type:'new_bid',metadata:{job_id:'j'}}),'/jobs/j')
})
test('pending requests and attachment messages use truthful readable text',()=>{
  assert.equal(statusLabel('pending'),'Booking request')
  assert.equal(statusLabel('confirmed'),'Confirmed')
  assert.equal(messagePreview('{"type":"photo","url":"private"}'),'Photo')
  assert.equal(messagePreview('{"type":"location","latitude":1}'),'Shared location')
  assert.equal(messagePreview('Can we start Monday?'),'Can we start Monday?')
})
