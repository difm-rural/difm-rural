import {notificationHint} from '../shared/notificationHints.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/components/notification-action.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function render(n){
 const calls=[]
 const jsx=(type,props)=>({type,props})
 const module={exports:{}}
 vm.runInNewContext(code,{exports:module.exports,require(name){
  if(name==='@shared/notificationHints')return {notificationHint}
  if(name==='react')return {useState:value=>[value,()=>{}],useTransition:()=>[false,fn=>fn()],useActionState:(_,s)=>[s,()=>{},false]}
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'}
  if(name==='lucide-react')return new Proxy({},{get:()=>'svg'})
  if(name==='./navigation-link')return {default:'a'}
  if(name==='./navigation-feedback')return {useNavigationFeedback:()=>({pending:null,begin(){}})}
  throw Error(name)
 }})
 const markRead=(id,options)=>{calls.push([id,options]);return new Promise(()=>{})}
 const tree=module.exports.NotificationRow({n:{id:'n1',href:'/jobs/j',read:false,body:'Hi',iconKey:'bell',side:null,tag:null,created_at:'',relative:'',fullDate:'',...n},markRead,answerAvailability:n.type==='availability_check'?()=>new Promise(()=>{}):undefined})
 const kids=[tree.props.children].flat(),link=kids.find(c=>c&&c.type==='a'),mark=kids.find(c=>c&&c.props?.className==='notification-mark')
 return {tree,link,mark,calls}
}
test('opening a notice links the whole row and marks it read in the background',()=>{
 const {link,calls}=render({type:'job_ready'})
 assert.equal(link.props.href,'/jobs/j')
 assert.equal(link.props.onClick(),undefined) // never waits on the update
 assert.deepEqual(calls,[['n1',undefined]])
})
test('message notices are left for the conversation to mark read',()=>{
 const {link,calls}=render({type:'new_message'})
 link.props.onClick()
 assert.deepEqual(calls,[])
})
test('already-read notices are not updated again and show no Mark read button',()=>{
 const {link,mark,calls}=render({type:'job_ready',read:true})
 link.props.onClick()
 assert.deepEqual(calls,[]);assert.equal(mark,undefined)
})
const nodes=(node,inside=false,out=[])=>{
 if(!node||typeof node!=='object')return out
 if(Array.isArray(node)){node.forEach(n=>nodes(n,inside,out));return out}
 if(node.type)out.push({type:node.type,inside})
 nodes(node.props?.children,inside||node.type==='a',out)
 return out
}
test('row actions sit beside the stretched link, never inside it',()=>{
 for(const n of [{type:'job_ready'},{type:'new_message'}]){
  const {tree}=render(n)
  const all=nodes(tree)
  assert.ok(all.some(x=>x.type==='a'))
  assert.ok(all.some(x=>x.type==='button'))
  assert.deepEqual(all.filter(x=>x.type==='button'&&x.inside),[])
 }
 // Availability quick actions too.
 const {tree}=render({type:'availability_check'})
 assert.deepEqual(nodes(tree).filter(x=>x.type==='button'&&x.inside),[])
})
test('middle-click marks read too; other buttons do not',()=>{
 const {link,calls}=render({type:'job_ready'})
 link.props.onAuxClick({button:2});assert.equal(calls.length,0)
 link.props.onAuxClick({button:1});assert.equal(calls.length,1)
})
test('the Mark read button marks message notices too',()=>{
 const {mark,calls}=render({type:'new_message'})
 mark.props.onClick()
 assert.equal(JSON.stringify(calls),JSON.stringify([['n1',{includeMessages:true}]]))
})

const nativeSource=await readFile(new URL('../src/lib/notifications.js',import.meta.url),'utf8')
const openSource=nativeSource.slice(nativeSource.indexOf('export async function openNotificationTarget'),nativeSource.indexOf('export function notificationTimeAgo')).replace('export async function','async function')
for(const leave of [false,true])test(`mobile slow lookup ${leave?'does not reopen after leaving':'opens and acknowledges'}`,async()=>{
 let resolve,blur,reads=0;const navigations=[]
 const query={select(){return query},eq(){return query},maybeSingle(){return new Promise(r=>resolve=r)},update(){reads++;return query},then(fn){return Promise.resolve({}).then(fn)}}
 const context={supabase:{from:()=>query},requestBadgeRefresh(){},Alert:{alert(){}}}
 vm.createContext(context);vm.runInContext(openSource+';this.open=openNotificationTarget',context)
 const pending=context.open({addListener:(name,fn)=>{blur=fn;return ()=>{}},navigate:(...args)=>{navigations.push(args);blur()}},'viewer',{id:'n',type:'job_update',metadata:{job_id:'j'}})
 if(leave)blur()
 resolve({data:{id:'j',requester_id:'other'}})
 await pending
 assert.equal(navigations.length,leave?0:1)
 assert.equal(reads,leave?0:1)
})
