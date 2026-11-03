import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/components/notification-action.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
async function run(leave){
 let resolve,calls=0;const pushed=[],listeners={},effects=[]
 const jsx=(type,props)=>({type,props})
 const module={exports:{}}
 vm.runInNewContext(code,{exports:module.exports,FormData:class{},window:{addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},require(name){
  if(name==='react')return {useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:fn=>effects.push(fn)}
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx}
  if(name==='next/navigation')return {useRouter:()=>({push:href=>pushed.push(href)})}
  if(name==='./navigation-feedback')return {useNavigationFeedback:()=>({pending:null,begin(){}})}
  throw Error(name)
 }})
 const tree=module.exports.NotificationAction({label:'View details',action:()=>{calls++;return new Promise(r=>resolve=r)}})
 effects.forEach(fn=>fn())
 const event={preventDefault(){},currentTarget:{}}
 const pending=tree.props.onSubmit(event)
 await tree.props.onSubmit(event)
 if(leave)listeners.popstate()
 resolve({error:'',href:'/jobs/example'});await pending
 return {pushed,calls}
}
test('a slow notification opens once when the user stays',async()=>{
 assert.deepEqual(await run(false),{pushed:['/jobs/example'],calls:1})
})
test('Back cancels a late notification destination',async()=>{
 assert.deepEqual(await run(true),{pushed:[],calls:1})
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
