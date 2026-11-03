import assert from 'node:assert/strict'
import test from 'node:test'
import {navigationTarget} from '../shared/navigationTarget.ts'
const current='https://dev.ruralconnections.nz/jobs?page=1'
test('internal section and query navigation gets a loading destination',()=>{
 assert.equal(navigationTarget('/messages',current),'/messages')
 assert.equal(navigationTarget('?page=2',current),'/jobs?page=2')
 assert.equal(navigationTarget({pathname:'/jobs',query:{page:2,category:'Fencing & Gates'}},current),'/jobs?page=2&category=Fencing+%26+Gates')
 assert.equal(navigationTarget('https://dev.ruralconnections.nz/account',current),'/account')
})
test('same-page links and hash jumps do not leave the screen stuck loading',()=>{
 for(const href of ['#details','/jobs?page=1','/jobs?page=1#details'])assert.equal(navigationTarget(href,current),null)
})
test('external, authentication-action and unsafe links do not start page transitions',()=>{
 for(const href of ['https://ruralconnections.nz/','mailto:hello@ruralconnections.nz','javascript:alert(1)','/auth/signout',{hostname:'other.example',pathname:'/jobs'},null])assert.equal(navigationTarget(href,current),null)
})
