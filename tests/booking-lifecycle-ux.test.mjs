import test from 'node:test'
import assert from 'node:assert/strict'
import {savedBookingSummary,bookingAcceptanceMessage,grazingCompletionFeedback,consumeBookingSent,GRAZING_COMPLETION} from '../shared/bookingLifecycleUx.ts'
import {bookingLocationHelp} from '../shared/bookingLocation.ts'
const booking={quantity:2,expected_duration:4,expected_duration_unit:'week',service:{kind:'grazing',pricing_type:'per_unit',rate:999,unit_label:'head/week'},pricing_snapshot:{version:1,kind:'grazing',pricing_type:'per_unit',rate:50,unit_label:'head/week'}}
test('historical summary and acceptance use saved rate rather than edited listing',()=>{
 const s=savedBookingSummary(booking);assert.equal(s.total,400);assert.equal(s.periodAmount,100);assert.equal(s.duration,'4 weeks')
 const message=bookingAcceptanceMessage(booking,'Peter');assert.match(message,/Peter/);assert.match(message,/400/);assert.doesNotMatch(message,/999/);assert.match(message,/not confirming final payment/)
})
test('legacy and incomplete snapshots do not invent historical prices or duration',()=>{
 for(const pricing_snapshot of [null,{version:1}]){const s=savedBookingSummary({...booking,pricing_snapshot,expected_duration:null,expected_duration_unit:null});assert.equal(s.unitRate,'Not recorded');assert.equal(s.total,null);assert.equal(s.duration,'To be agreed')}
})
test('location wording distinguishes role, lifecycle and authorised disclosure',()=>{
 assert.match(bookingLocationHelp('grazing','requester'),/provider will confirm/)
 assert.equal(bookingLocationHelp('grazing','requester','confirmed','Hamilton',true),'Grazing location shared. Agree access details with the provider.')
 assert.doesNotMatch(bookingLocationHelp('grazing','requester','confirmed','Hamilton',false),/location shared/)
 assert.equal(bookingLocationHelp('grazing','provider','confirmed'),'Confirm access arrangements with the requester.')
 assert.equal(bookingLocationHelp('grazing','provider','completed','Hamilton'),'Grazing arrangement completed in Hamilton.')
})
test('completion feedback reflects relist or close without collecting payment',()=>{
 assert.match(GRAZING_COMPLETION.payment,/does not collect or record payment/)
 assert.match(grazingCompletionFeedback(true).message,/available for new requests/)
 assert.match(grazingCompletionFeedback(false).message,/now closed/)
 for(const choice of [true,false]){assert.equal(grazingCompletionFeedback(choice).title,'Grazing booking completed');assert.match(grazingCompletionFeedback(choice).message,/Both parties can leave reviews/)}
})
test('request sent acknowledgement is consumed once per booking',()=>{
 const items=new Map(),storage={getItem:k=>items.get(k),setItem:(k,v)=>items.set(k,v)}
 assert.equal(consumeBookingSent(storage,'one'),true);assert.equal(consumeBookingSent(storage,'one'),false);assert.equal(consumeBookingSent(storage,'two'),true)
})
