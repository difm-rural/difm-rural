import test from 'node:test'
import assert from 'node:assert/strict'
import {formatOfferAvailability} from '../shared/offers.ts'
import {reviewNextMove} from '../shared/nextMove.ts'
import {agreedJobDetails} from '../shared/agreedJobDetails.ts'

test('offer availability can carry a start time',()=>{
 assert.equal(formatOfferAvailability('2026-12-01'),'Tue 1 Dec 2026')
 assert.equal(formatOfferAvailability('2026-12-01','09:00:00'),'Tue 1 Dec 2026, 9:00 am')
 assert.equal(formatOfferAvailability('2026-12-01','13:30'),'Tue 1 Dec 2026, 1:30 pm')
 assert.equal(formatOfferAvailability('2026-12-01','00:15'),'Tue 1 Dec 2026, 12:15 am')
 assert.equal(agreedJobDetails(null,null,'2026-12-01','09:00:00').proposedStart,'Tue 1 Dec 2026, 9:00 am')
})

test('completed, unreviewed work asks the viewer for a review',()=>{
 const move=reviewNextMove('Bot Provider','requester')
 assert.equal(move.needsAction,true)
 assert.equal(move.detail,'Leave a review for Bot')
 assert.equal(move.actionLabel,'Leave a review')
 assert.equal(reviewNextMove(null,'provider').detail,'Leave a review for the requester')
})
