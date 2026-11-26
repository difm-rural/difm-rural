import test from 'node:test'
import assert from 'node:assert/strict'
import {chatEventText,chatEventPreview,isChatEvent} from '../shared/chatEvents.ts'

test('automatic payment notes read as status lines, not as typed messages',()=>{
 assert.equal(chatEventText('Payment all taken care of ✓',true,'Grokbot Reviewer'),'You marked payment as sorted ✓')
 assert.equal(chatEventText('Payment all taken care of ✓',false,'Grokbot Reviewer'),'Grokbot marked payment as sorted ✓')
 assert.equal(chatEventText('Payment marked as not sorted yet',false,null),'The other person marked payment as not sorted yet')
 assert.equal(chatEventText('Payment marked as not sorted yet',false,'Community member'),'The other person marked payment as not sorted yet')
})

test('ordinary messages are left alone',()=>{
 assert.equal(chatEventText('Paid, thanks',true,'Sam'),null)
 assert.equal(chatEventText('Payment all taken care of ✓ cheers',true,'Sam'),null)
 assert.equal(isChatEvent(null),false)
})

test('the provider confirmation reads as a status, keeping its payment and note lines',()=>{
 const body="Confirmed: I'll be there around Tue 1 Dec 2026, 9:00 am.\nPayment: $120 by bank transfer.\n\nSee you then"
 assert.equal(chatEventText(body,true,'Bot Requester'),"You confirmed the job: arriving around Tue 1 Dec 2026, 9:00 am.\nPayment: $120 by bank transfer.\n\nSee you then")
 assert.match(chatEventText(body,false,'Bot Provider'),/^Bot confirmed the job: arriving around Tue 1 Dec 2026, 9:00 am\./)
 assert.equal(chatEventPreview(body,true,'Sam'),'You confirmed the job: arriving around Tue 1 Dec 2026, 9:00 am.')
})
