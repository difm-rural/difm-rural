import test from 'node:test'
import assert from 'node:assert/strict'
import {sideTag} from '../shared/marketSide.ts'
import {NOTIFICATION_ICON_KEYS} from '../shared/notificationIcons.ts'
import {arrangementSummary,arrangementTime} from '../shared/notificationArrangement.ts'
import {notificationBody} from '../shared/notificationBody.ts'
import {notificationHref} from '../provider-web/src/lib/work.ts'
import {notificationHint} from '../shared/notificationHints.ts'
const notice={type:'job_confirmed',body:`Peter Provider confirmed 'Fix leaking water trough': around Tue 24 Nov 2026, 4:00 pm, already agreed.`,metadata:{job_id:'j'}}
test('event labels are consistent for both marketplace sides and cover existing event types',()=>{
 for(const [type,label] of Object.entries({review_received:'REVIEW',job_completed:'COMPLETED',new_message:'MESSAGE',job_confirmed:'CONFIRMED',new_bid:'OFFER',new_question:'QUESTION',question_answered:'ANSWER',bid_accepted:'ACCEPTED',new_booking:'BOOKING',booking_confirmed:'BOOKING',booking_completed:'COMPLETED'}))
  for(const side of ['job','listing',null])assert.equal(sideTag(side,{type}),label)
 for(const type of Object.keys(NOTIFICATION_ICON_KEYS))assert.ok(!['JOB','YOUR JOB','LISTING','YOUR LISTING'].includes(sideTag('job',{type})),type)
 assert.equal(sideTag(null,{type:'unknown'}),'UPDATE')
})
test('arrangement summary uses first name, retains title and does not mutate stored details',()=>{
 const original=structuredClone(notice)
 assert.equal(notificationBody(notice),"Peter confirmed arrangements for 'Fix leaking water trough'.")
 assert.equal(arrangementTime(notice),'Tue 24 Nov 2026, 4:00 pm (NZ time)')
 assert.deepEqual(notice,original)
 assert.equal(arrangementSummary({...notice,body:'The provider confirmed "Fix trough": around Tue 24 Nov, 04:00pm, already agreed.'}),"The provider confirmed arrangements for 'Fix trough'.")
 assert.equal(arrangementTime({...notice,body:'Peter confirmed "Fix trough": around Tue 24 Nov, 04:00pm, already agreed.'}),'Tue 24 Nov, 4:00 pm (NZ time)')
})
test('explicit agreed timestamps format in NZ local time and handle winter/summer offsets',()=>{
 const summer=arrangementTime({...notice,metadata:{arrival_start_at:'2026-11-24T03:00:00Z'}})
 assert.match(summer,/24 Nov 2026/);assert.match(summer,/4:00 pm/)
 assert.match(arrangementTime({...notice,metadata:{arrival_start_at:'2026-07-24T03:00:00Z'}}),/3:00 pm/)
 assert.match(arrangementTime({...notice,metadata:{arrival_start_at:'2026-11-24T03:00:00Z'}},'UTC'),/3:00 am/)
})
test('invalid dates and unrecognised details never produce fabricated agreed times',()=>{
 for(const time of ['Tue 31 Nov 2026, 4:00 pm','Tue 24 Nov 2026, 13:00 pm','Wed 24 Nov 2026, 4:00 pm','Tue 24 Nov 2026, 4:70 pm'])assert.equal(arrangementTime({...notice,body:`Peter confirmed "Fix trough": around ${time}, already agreed.`}),null)
 assert.equal(arrangementTime({type:'job_confirmed',body:'No date supplied',metadata:{arrival_start_at:'2026-02-30T03:00:00Z'}}),null)
 assert.equal(arrangementTime({type:'new_message',body:notice.body,metadata:{arrival_start_at:'2026-11-24T03:00:00Z'}}),null)
 const legacy={type:'job_confirmed',body:'Arrangements changed. Bring a ladder.'};assert.equal(notificationBody(legacy),legacy.body);assert.equal(arrangementTime(legacy),null)
})
test('reply and review hints keep existing authorised conversation and review destinations',()=>{
 for(const [meta,expected] of [[{job_id:'j',sender_id:'p'},'/jobs/j?thread=p#conversation'],[{booking_id:'b',sender_id:'p'},'/bookings/b#conversation'],[{service_id:'s',sender_id:'p'},'/listings/s?thread=p#enquiries']])assert.equal(notificationHref({type:'new_message',metadata:meta}),expected)
 assert.equal(notificationHint('new_message'),'Reply in chat');assert.equal(notificationHint('job_completed'),'View review options')
 assert.equal(notificationHref({type:'job_completed',metadata:{job_id:'j'}}),'/jobs/j#reviews')
 assert.equal(notificationHref({type:'booking_completed',metadata:{booking_id:'b'}}),'/bookings/b#reviews')
})
