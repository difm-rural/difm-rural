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

test('a completed job with payment sorted has no payment Undo',()=>{
 assert.equal(paymentAcknowledgementAvailable('completed','accepted',true,'2026-11-26T07:17:37Z'),false)
 assert.equal(paymentAcknowledgementAvailable('completed','accepted',true,null),true)
})
