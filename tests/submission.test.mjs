import assert from 'node:assert/strict'
import test from 'node:test'
import {runSubmission} from '../shared/submission.ts'
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
test('feedback and lock start before slow work, and rapid repeat taps do not submit again',async()=>{
 const lock={current:false},wait=deferred(),events=[]
 const task=async()=>{events.push('request');await wait.promise;return true}
 const start=()=>events.push('busy'),finish=()=>events.push('idle'),error=()=>events.push('error')
 const first=runSubmission(lock,task,start,finish,error)
 assert.deepEqual(events,['busy','request']);assert.equal(lock.current,true)
 assert.equal(await runSubmission(lock,task,start,finish,error),false)
 assert.deepEqual(events,['busy','request'])
 wait.resolve();assert.equal(await first,true)
 assert.equal(lock.current,true);assert.ok(!events.includes('idle'))
})
test('successful saves stay busy while navigation or the success confirmation is pending',async()=>{
 const lock={current:false};let busy=false,calls=0
 await runSubmission(lock,async()=>{calls++;return true},()=>busy=true,()=>busy=false,()=>{})
 assert.equal(busy,true);assert.equal(lock.current,true)
 await runSubmission(lock,async()=>{calls++;return true},()=>busy=true,()=>busy=false,()=>{})
 assert.equal(calls,1)
})
test('validation failure or cancelled location confirmation releases the form for correction',async()=>{
 const lock={current:false};let busy=false
 assert.equal(await runSubmission(lock,async()=>false,()=>busy=true,()=>busy=false,()=>assert.fail('Not a network failure')),false)
 assert.equal(busy,false);assert.equal(lock.current,false)
})
test('unexpected failures show feedback, release the lock and allow retry',async()=>{
 const lock={current:false},events=[]
 assert.equal(await runSubmission(lock,async()=>{throw Error('Offline')},()=>events.push('busy'),()=>events.push('idle'),()=>events.push('error')),false)
 assert.deepEqual(events,['busy','error','idle']);assert.equal(lock.current,false)
 assert.equal(await runSubmission(lock,async()=>true,()=>{},()=>{},()=>{}),true)
})
