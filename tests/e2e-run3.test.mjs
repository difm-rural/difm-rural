import test from 'node:test'
import assert from 'node:assert/strict'
import {homeAttentionSummary} from '../shared/homeSummary.ts'
import {paymentAcknowledgementAvailable} from '../shared/paymentAcknowledgement.ts'

test('an empty Home mode points at the other mode instead of claiming nothing needs action',()=>{
 assert.equal(homeAttentionSummary([],0,3,{label:'My Work',count:1}).text,'Nothing needs your action here. 1 item needs you in My Work.')
 assert.equal(homeAttentionSummary([],0,0,{label:'My Property',count:2}).text,'Nothing needs your action here. 2 items need you in My Property.')
 assert.equal(homeAttentionSummary([],0,0,{label:'My Work',count:0}).text,"You're all caught up.")
 assert.equal(homeAttentionSummary([{needsAction:true}],0,0,{label:'My Work',count:4}).text,'1 item needs your attention.')
})

test('payment received: only the provider, only after completion (undo stays for a mis-tap)',()=>{
 assert.equal(paymentAcknowledgementAvailable('completed','accepted',true,'2026-11-26T07:17:37Z'),true)
 assert.equal(paymentAcknowledgementAvailable('completed','accepted',false,null),false)
 assert.equal(paymentAcknowledgementAvailable('accepted','accepted',true,null),false)
})

test("offer dates use NZ's today, not the server's UTC date",async()=>{
 const {nzToday}=await import('../shared/postingDates.ts')
 // 9am NZDT on 27 Nov is still 26 Nov in UTC; the earliest allowed day must be the 27th.
 assert.equal(nzToday(new Date('2026-11-26T20:00:00Z')),'2026-11-27')
})
