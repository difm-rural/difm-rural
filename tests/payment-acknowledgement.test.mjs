import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {paymentAcknowledgement as copy,paymentAcknowledgementActor,paymentAcknowledgementAvailable} from '../shared/paymentAcknowledgement.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url))
const jsx=webRequire('react/jsx-runtime')
const source=await readFile(new URL('../provider-web/src/app/jobs/[id]/payment-requester.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText

function elements(node){
 if(!node||typeof node!=='object')return []
 if(Array.isArray(node))return node.flatMap(elements)
 return [node,...elements(node.props?.children)]
}
function card({sortedAt=null,canUpdate=true,state={error:''},pending=false}={}){
 const module={exports:{}}
 let nextId=0
 vm.runInNewContext(code,{exports:module.exports,require(name){
  if(name==='react/jsx-runtime')return jsx
  if(name==='react')return {useActionState:()=>[state,()=>{},pending],useEffect:()=>{},useId:()=>`id-${++nextId}`,useRef:current=>({current})}
  if(name==='@shared/paymentAcknowledgement')return {paymentAcknowledgement:copy}
  if(name==='../../work-actions')return {markJobPaymentSorted:()=>{}}
  if(name==='@/components/pending-note')return {PendingNote:()=>null}
  throw Error(name)
 }})
 return elements(module.exports.PaymentSorted({bidId:'award',jobId:'job',sortedAt,actor:'provider',methodLabel:'Invoice',canUpdate}))
}
const button=(nodes,label)=>nodes.find(node=>node.type==='button'&&node.props.children===label)
const text=(nodes,tag,val)=>nodes.some(node=>node.type===tag&&node.props.children===val)

test('payment remains visible and shows only authorised primary actions',()=>{
 for(const canUpdate of [true,false]){
  const unsorted=card({canUpdate})
  assert.ok(text(unsorted,'h2','Payment'))
  assert.ok(text(unsorted,'p',copy.reminder))
  assert.equal(!!button(unsorted,copy.mark),canUpdate)
  assert.equal(!!button(unsorted,copy.undo),false)
  const sorted=card({canUpdate,sortedAt:'2026-11-17T03:00Z'})
  assert.ok(text(sorted,'h2','Payment'))
  assert.ok(text(sorted,'strong',copy.sorted))
  assert.equal(text(sorted,'p',copy.reminder),false)
  assert.equal(!!button(sorted,copy.undo),canUpdate)
 }
})

test('Undo opens an accessible dialog; cancel does not submit and duplicate submits are blocked',()=>{
 const nodes=card({sortedAt:'2026-11-17T03:00Z'})
 const dialog=nodes.find(n=>n.type==='dialog')
 let opened=0,closed=0,blocked=0
 dialog.props.ref.current={showModal(){opened++},close(){closed++}}
 assert.equal(button(nodes,copy.undo).props.type,'button')
 button(nodes,copy.undo).props.onClick()
 assert.equal(opened,1)
 assert.ok(nodes.some(n=>n.props.id===dialog.props['aria-labelledby']&&n.props.children===copy.undoTitle))
 assert.ok(nodes.some(n=>n.props.id===dialog.props['aria-describedby']&&n.props.children===copy.undoDetail))
 const cancel=button(nodes,'Cancel')
 assert.equal(cancel.props.type,'button')
 cancel.props.onClick()
 const form=dialog.props.children.find(n=>n.type==='form')
 assert.ok(form.props.children.some(n=>n.props.name==='undo'&&n.props.value==='true'))
 const event={preventDefault(){blocked++}}
 assert.equal(closed,1)
 form.props.onSubmit(event)
 form.props.onSubmit(event)
 assert.equal(closed,2)
 assert.equal(blocked,1)
})

test('both failures preserve the existing status and feedback is accessible',()=>{
 for(const sortedAt of [null,'2026-11-17T03:00Z']){
  const failed=card({sortedAt,state:{error:copy.error}})
  assert.equal(text(failed,'strong',copy.sorted),!!sortedAt)
  assert.ok(failed.some(n=>n.props.role==='alert'&&n.props.children===copy.error))
  const pending=card({sortedAt,pending:true})
  assert.ok(button(pending,'Saving…').props.disabled)
  const message=sortedAt?copy.sorted:copy.removed
  const updated=card({sortedAt,state:{error:'',success:message}})
  assert.equal(updated.filter(n=>n.props.role==='status').length,1)
  assert.ok(sortedAt?text(updated,'strong',message):text(updated,'p',message))
 }
})

test('acknowledgement attribution and eligibility mirror the current participant and RPC rules',()=>{
 assert.equal(paymentAcknowledgementActor('requester','requester','provider'),'requester')
 assert.equal(paymentAcknowledgementActor('provider','requester','provider'),'provider')
 for(const actor of [null,'not-a-party'])assert.equal(paymentAcknowledgementActor(actor,'requester','provider'),null)
 assert.ok(paymentAcknowledgementAvailable('accepted','accepted',true))
 assert.ok(!paymentAcknowledgementAvailable('accepted','pending',true))
 assert.ok(!paymentAcknowledgementAvailable('accepted','accepted',false))
 assert.ok(paymentAcknowledgementAvailable('completed','accepted',true))
 assert.ok(!paymentAcknowledgementAvailable('completed','pending',true))
 assert.ok(!paymentAcknowledgementAvailable('completed','accepted',false))
 for(const status of ['open','cancelled','in_progress'])assert.ok(!paymentAcknowledgementAvailable(status,'accepted',true))
 // Settled: a completed job whose payment is sorted offers no Undo.
 assert.ok(!paymentAcknowledgementAvailable('completed','accepted',true,'2026-11-26T07:17:37Z'))
 assert.ok(paymentAcknowledgementAvailable('accepted','accepted',true,'2026-11-26T07:17:37Z'))
})

test('mobile mark and Undo use one RPC, preserve status on errors, and restore the reminder on success',async()=>{
 const source=await readFile(new URL('../src/components/JobPaymentHandoff.js',import.meta.url),'utf8')
 const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText
 const cells=[],calls=[]
 let cursor=0,confirmation,respond,fail=false
 const react={
  useRef(value){const i=cursor++;return cells[i]??=( {current:value} )},
  useState(value){const i=cursor++;if(!(i in cells))cells[i]=value;return [cells[i],v=>{cells[i]=v}]},
  useEffect(){},
 }
 const module={exports:{}}
 const Button='NativeButton'
 vm.runInNewContext(compiled,{exports:module.exports,require(name){
  if(name==='react/jsx-runtime')return jsx
  if(name==='react')return react
  if(name==='react-native')return {Alert:{alert(...args){confirmation=args}},StyleSheet:{create:x=>x},Text:'NativeText',View:'NativeView'}
  if(name==='../theme/tokens')return {colors:{}}
  if(name==='../lib/supabase')return {supabase:{rpc(name,args){
   calls.push([name,args.p_bid,args.p_undo])
   if(fail)return Promise.resolve({error:new Error('fixture failure')})
   return new Promise(resolve=>{respond=()=>resolve({error:null})})
  }}}
  if(name==='../../shared/paymentAcknowledgement')return {agreedPaymentMethodLabels:{},paymentAcknowledgement:copy,paymentAcknowledgementActor}
  if(name==='./Button')return {default:Button}
  throw Error(name)
 }})
 const render=()=>{cursor=0;return elements(module.exports.default({bidId:'award',canUpdate:true}))}
 const act=label=>render().find(n=>n.type===Button&&n.props.title===label)
 const has=value=>text(render(),'NativeText',value)

 fail=true
 await act(copy.mark).props.onPress()
 assert.ok(has(copy.reminder)&&has(copy.error))
 fail=false
 const mark=act(copy.mark)
 const marking=mark.props.onPress()
 await mark.props.onPress()
 assert.deepEqual(calls.slice(1),[['mark_job_payment_sorted','award',false]])
 assert.ok(act('Saving…').props.disabled)
 respond()
 await marking
 assert.ok(has(copy.sorted))


 act(copy.undo).props.onPress()
 assert.equal(confirmation[0],copy.undoTitle)
 assert.equal(confirmation[2][0].text,'Cancel')
 assert.equal(calls.length,2)
 fail=true
 await confirmation[2][1].onPress()
 assert.ok(has(copy.sorted)&&has(copy.error))
 fail=false
 act(copy.undo).props.onPress()
 const undoing=confirmation[2][1].onPress()
 assert.deepEqual(calls.at(-1),['mark_job_payment_sorted','award',true])
 respond()
 await undoing
 assert.ok(has(copy.reminder)&&has(copy.removed)&&!has(copy.sorted))
})

test('web completion ignores a legacy payment checkbox and both participants can review completed work',async()=>{
 const policy=await import('../provider-web/src/lib/activity-policy.ts')
 const module={exports:{}}
 const source=await readFile(new URL('../provider-web/src/app/activity/actions.ts',import.meta.url),'utf8')
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const work={id:'job',kind:'job',status:'accepted',requesterId:'requester',providerId:'provider'}
 const writes=[]
 const query={
  update(patch){writes.push(patch);return this},
  eq(){return this},
  async select(){return {data:[{id:'job'}],error:null}},
 }
 vm.runInNewContext(compiled,{exports:module.exports,performance,console,require(name){
  if(name==='next/cache')return {revalidatePath(){}}
  if(name==='next/navigation')return {}
  if(name==='@/lib/auth')return {requireProvider:async()=>({user:{id:'provider'},supabase:{
   from(table){assert.equal(table,'jobs');return query},
   rpc(){assert.fail('completion unexpectedly touched payment')},
  }})}
  if(name==='@/lib/activity-data')return {loadActivityWork:async()=>work}
  if(name==='@/lib/activity-policy')return policy
  throw Error(name)
 }})
 const data=new FormData()
 for(const [name,value] of Object.entries({id:'job',kind:'job',intent:'complete',payment_sorted:'on',bid_id:'legacy'}))data.set(name,value)
 assert.equal((await module.exports.manageArrangement({error:''},data)).error,'')
 assert.equal(JSON.stringify(writes),JSON.stringify([{status:'completed'}]))
 const completed={...work,status:'completed'}
 for(const userId of ['requester','provider'])assert.deepEqual(policy.workActions(completed,userId),['review'])
 assert.deepEqual(policy.workActions(completed,'outsider'),[])
})
