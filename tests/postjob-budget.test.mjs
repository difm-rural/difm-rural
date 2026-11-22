import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {moneyInputError} from '../shared/postingMoney.ts'

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')

test('Fixed price needs a positive budget; Open to offers needs none',()=>{
 for(const bad of ['','0','0.00','-5','abc','1e3','12.345'])assert.ok(moneyInputError(bad,'Budget'),bad)
 for(const good of ['250','0.50','99.9'])assert.equal(moneyInputError(good,'Budget'),'',good)
 const step4=read('src/screens/postjob/PostJobStep4Budget.js')
 // Empty fixed budget gets a plain message; Open to offers skips the amount.
 assert.match(step4,/Enter a budget above \$0, or choose Open to offers\./)
 assert.match(step4,/const budgetError = priceType === 'fixed'/)
 assert.match(step4,/return !budgetError/)
 // Switching modes keeps the typed amount (it lives in the wizard state).
 assert.match(step4,/updateJobData\(\{ priceType, price, materialsType \}\)/)
 const step5=read('src/screens/postjob/PostJobStep5Review.js')
 assert.match(step5,/budgetDisplay += priceType === 'fixed' \? `\$\{nzMoney\(price\)\} \(fixed price\)` : 'Open to offers'/)
 assert.match(step5,/price: +priceType === 'fixed' \? parseFloat\(price\) : null/)
 assert.match(step5,/moneyError=priceType==='fixed'\?moneyInputError\(price,'Budget'\):''/)
})

test('Budget step uses the same materials words as Review and shows the selection with a tick',()=>{
 const step4=read('src/screens/postjob/PostJobStep4Budget.js')
 for(const label of ['No materials needed','I supply materials','Provider to supply']){
  assert.ok(step4.includes("'"+label+"'"),label)
  assert.ok(read('src/screens/postjob/PostJobStep5Review.js').includes("'"+label+"'"),label)
 }
 assert.match(step4,/priceType === opt\.id \? 'checkmark-circle' : opt\.icon/)
 assert.match(step4,/materialsType === opt\.id \? 'checkmark-circle' : opt\.icon/)
 // The footer sits below the scroll area, not over it (no absolute positioning).
 assert.doesNotMatch(step4,/position: *'absolute'/)
})
