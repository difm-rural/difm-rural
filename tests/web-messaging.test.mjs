import assert from 'node:assert/strict'
import test from 'node:test'
import { groupInbox, matchesConversation, noticeMatchesConversation, attachment, chatPreview, conversationHref, validConversation, canReadConversation } from '../provider-web/src/lib/messaging.ts'
const message=(patch={})=>({id:'one',service_id:'listing',sender_id:'paul',receiver_id:'peter',content:'Hello',created_at:'2026-10-19T00:00:00Z',...patch})
const notice=(patch={})=>({id:'n',type:'new_message',body:'New message',read:false,metadata:{service_id:'listing',sender_id:'paul'},created_at:'2026-10-19T00:00:00Z',...patch})
test('sent enquiries stay in the inbox before any reply; unrelated messages stay out',()=>{
  const threads=groupInbox([message(),message({id:'private',sender_id:'stranger',receiver_id:'another'})],'paul')
  assert.equal(threads.length,1)
  assert.equal(threads[0].ref.person,'peter')
  assert.equal(threads[0].message.content,'Hello')
})
test('two enquirers and three domains on the same subject remain separate threads',()=>{
  const threads=groupInbox([message(),message({id:'two',sender_id:'other'}),message({id:'job',service_id:null,job_id:'listing'}),message({id:'booking',booking_id:'listing'})],'peter')
  assert.equal(threads.length,4)
  assert.equal(new Set(threads.map(t=>t.ref.kind+':'+t.ref.id+':'+t.ref.person)).size,4)
  assert.equal(threads.find(t=>t.ref.kind==='booking').message.id,'booking')
})
test('incoming and outgoing messages group by participant pair and latest timestamp',()=>{
  const threads=groupInbox([message(),message({id:'reply',sender_id:'peter',receiver_id:'paul',created_at:'2026-10-19T01:00:00Z',content:'Yes'})],'paul')
  assert.equal(threads.length,1);assert.equal(threads[0].message.id,'reply')
  const ref={kind:'listing',id:'listing',person:'peter'}
  assert.equal(matchesConversation(message(),ref,'paul'),true)
  assert.equal(matchesConversation(message({receiver_id:'outsider'}),ref,'paul'),false)
  assert.equal(matchesConversation(message({service_id:'other'}),ref,'paul'),false)
})
test('unread notices match sender and domain; booking notices cannot mark a listing enquiry read',()=>{
  const ref={kind:'listing',id:'listing',person:'paul'}
  assert.equal(noticeMatchesConversation(notice(),ref),true)
  assert.equal(noticeMatchesConversation(notice({metadata:{service_id:'listing',sender_id:'other'}}),ref),false)
  assert.equal(noticeMatchesConversation(notice({metadata:{service_id:'listing',booking_id:'booking',sender_id:'paul'}}),ref),false)
  assert.equal(noticeMatchesConversation(notice({type:'new_booking'}),ref),false)
})
test('only the visible focused conversation can mark received messages read',()=>{
  assert.equal(canReadConversation('visible',true,'message'),true)
  assert.equal(canReadConversation('hidden',true,'message'),false)
  assert.equal(canReadConversation('visible',false,'message'),false)
  assert.equal(canReadConversation('visible',true,undefined),false)
})
test('app-compatible photos and locations render readable content with safe URLs and coordinates',()=>{
  assert.equal(attachment(JSON.stringify({type:'photo',url:'https://example.com/photo.jpg',caption:'Fence'})).type,'photo')
  assert.equal(attachment(JSON.stringify({type:'photo',url:'javascript:alert(1)'})).type,'text')
  const location=attachment(JSON.stringify({type:'location',text:'Property gate',latitude:-37.8,longitude:175.3}))
  assert.equal(location.latitude,-37.8);assert.equal(location.text,'Property gate')
  assert.equal(attachment(JSON.stringify({type:'location',latitude:190,longitude:0})).latitude,null)
  assert.equal(attachment(JSON.stringify({type:'location',latitude:'0',longitude:0})).latitude,null)
  assert.equal(chatPreview(JSON.stringify({type:'photo',url:'https://example.com/p.jpg'})),'Photo')
  assert.equal(chatPreview(JSON.stringify({type:'location',text:'Gate'})),'Shared location')
  assert.deepEqual(attachment('How is Tuesday?'),{type:'text',text:'How is Tuesday?'})
  assert.deepEqual(attachment('null'),{type:'text',text:'null'})
})
test('conversation links validate UUIDs and encode query values',()=>{
  const ref={kind:'listing',id:'00000000-0000-0000-0000-000000000001',person:'00000000-0000-0000-0000-000000000002'}
  assert.equal(validConversation(ref),true)
  assert.equal(validConversation({...ref,id:'id),sender_id.eq.other'}),false)
  assert.equal(validConversation({...ref,kind:'private-table'}),false)
  assert.match(conversationHref({...ref,person:'person&other=bad'}),/person=person%26other%3Dbad$/)
})
