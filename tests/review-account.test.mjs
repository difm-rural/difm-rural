import assert from 'node:assert/strict'
import test from 'node:test'
import {isReviewAccount,REVIEW_EMAIL,reviewSignInFailure} from '../shared/reviewAccount.ts'
test('only the exact review account uses password login, ignoring case and outer spaces',()=>{
 assert.equal(REVIEW_EMAIL,'review@ruralconnections.nz')
 for(const email of ['review@ruralconnections.nz',' REVIEW@RURALCONNECTIONS.NZ '])assert.equal(isReviewAccount(email),true)
 for(const email of ['','someone@ruralconnections.nz','review+test@ruralconnections.nz','review@ruralconnections.nz.example.com'])assert.equal(isReviewAccount(email),false)
})
test('password failures have useful wording and never expose backend details',()=>{
 assert.match(reviewSignInFailure({code:'invalid_credentials'}),/password was not recognised/)
 assert.match(reviewSignInFailure({status:429}),/Wait a minute/)
 assert.match(reviewSignInFailure(null),/connection/)
 assert.equal(reviewSignInFailure({code:'internal_database_details'}),reviewSignInFailure(null))
})
