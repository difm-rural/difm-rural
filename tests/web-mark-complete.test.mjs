import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as formatting from '../shared/formatting.js'
const require=createRequire(import.meta.url),ts=require('typescript')
const webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url))
const React=webRequire('react'),jsx=webRequire('react/jsx-runtime'),{renderToStaticMarkup}=webRequire('react-dom/server')
const source=await readFile(new URL('../provider-web/src/components/work/manage-actions.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module={exports:{}}
// The form wrapper renders its children and its submit label, like ActionForm.
const ActionForm=({label,children})=>React.createElement('form',null,children,React.createElement('button',null,label))
vm.runInNewContext(code,{exports:module.exports,require(name){
 if(name==='react/jsx-runtime')return jsx
 if(name==='@shared/formatting')return formatting
 if(name==='@/components/action-form')return {ActionForm}
 if(name==='@/app/activity/actions')return {manageArrangement:async()=>({error:''})}
 if(name==='@/lib/activity-policy')return {}
 throw Error(name)
}})
const render=props=>renderToStaticMarkup(React.createElement(module.exports.ManageActions,{id:'work-1',otherFirst:'Sam',...props}))
const requiredTicks=html=>(html.match(/<input type="checkbox" required=""/g)||[]).length

test('completion is offered without payment fields, regardless of acknowledgement',()=>{
 for (const paymentSortedAt of [null, '2026-11-12T00:00:00Z']) {
  const html=render({kind:'job',actions:['complete'],paymentSortedAt})
  assert.equal(requiredTicks(html),0)
  assert.match(html,/Marking complete closes this job and invites Sam to leave a review/)
  assert.doesNotMatch(html,/payment|name="bid_id"/i)
  assert.match(html,/<button>Mark complete<\/button>/)
 }
})

test('marking a booking complete needs no required tick either',()=>{
 const html=render({kind:'booking',actions:['complete']})
 assert.equal(requiredTicks(html),0)
 assert.match(html,/Marking complete closes this booking and invites Sam to leave a review/)
 assert.doesNotMatch(html,/name="payment_sorted"/)
})

test('cancel, withdraw, cancellation and close-arrangement actions keep their required tick',()=>{
 for(const [kind,intent] of [['job','cancel'],['booking','withdraw'],['booking','request_cancel'],['booking','confirm_cancel'],['booking','close_grazing'],['booking','relist_grazing']]){
  assert.equal(requiredTicks(render({kind,actions:[intent]})),1,intent)
 }
})
