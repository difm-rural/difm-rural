import test from 'node:test'
import assert from 'node:assert/strict'
import {notificationBody} from '../shared/notificationBody.ts'
test('legacy Home and Notifications matches omit stored distance while retaining the job and reasons',()=>{
 assert.equal(notificationBody({type:'opportunity_match',body:'Spray paddocks for carrot weed · 28 km away. Matches your skills · Within your travel area.'}),'Spray paddocks for carrot weed · Matches your skills · Within your travel area.')
})
test('new match text and unrelated notifications are unchanged',()=>{
 for(const type of ['new_message','booking_confirmed'])assert.equal(notificationBody({type,body:'We can travel 28 km away. Is that okay?'}),'We can travel 28 km away. Is that okay?')
 assert.equal(notificationBody({type:'opportunity_match',body:'Spraying job · Matches your skills.'}),'Spraying job · Matches your skills.')
 assert.equal(notificationBody({type:'opportunity_match',body:null}),'')
})
