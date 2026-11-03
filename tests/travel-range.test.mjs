import assert from 'node:assert/strict'
import test from 'node:test'
import {travelRangeError,travelRangeValue,MAX_TRAVEL_RANGE_KM} from '../shared/travelRange.ts'
test('travel range rejects the reported invalid inputs and partial numeric parses',()=>{
 for(const value of ['abc','-10','999999','12km','1e3','12.5','NaN','Infinity','2001']){
  assert.ok(travelRangeError(value),value)
  assert.throws(()=>travelRangeValue(value),value)
 }
})
test('optional travel range preserves blank and zero and accepts bounded whole kilometres',()=>{
 for(const value of ['',null,undefined,'  ']){assert.equal(travelRangeError(value),'');assert.equal(travelRangeValue(value),null)}
 for(const [value,expected] of [['0',0],['50',50],[' 250 ',250],[MAX_TRAVEL_RANGE_KM,2000]]){assert.equal(travelRangeError(value),'');assert.equal(travelRangeValue(value),expected)}
})
