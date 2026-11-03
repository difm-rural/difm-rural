import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as review from '../shared/reviewAccount.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/app/login/login-form.tsx',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(){
 const state=[],refs=[],calls=[],redirects=[];let index=0,refIndex=0,tree,passwordFailure=null
 const react={useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial})},useEffect(){}}
 const auth={async signInWithOtp(args){calls.push(['otp',args]);return {error:null}},async verifyOtp(args){calls.push(['verify',args]);return {error:null}},async signInWithPassword(args){calls.push(['password',args]);return {data:{session:passwordFailure?null:{}},error:passwordFailure}}}
 const module={exports:{}}
 vm.runInNewContext(compiled,{exports:module.exports,require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};if(name==='@shared/reviewAccount')return review;if(name==='@/lib/supabase/client')return {createClient:()=>({auth})};if(name==='@/lib/first-time')return {normaliseEmail:s=>s.trim().toLowerCase(),validEmail:s=>/^[^@]+@[^@]+\.[^@]+$/.test(s),signInFailure:()=> 'Code failed',signInRetrySeconds:()=>0};throw Error(name)},window:{location:{origin:'https://example.test',assign:path=>redirects.push(path)}},Date,console})
 function render(){index=0;refIndex=0;tree=module.exports.LoginForm({destination:'/jobs/example'});return tree}
 function nodes(node=tree){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).filter(child=>child!==undefined).flatMap(child=>nodes(child))]}
 render()
 return {calls,redirects,render,nodes,field(id,value){nodes().find(n=>n.props?.id===id).props.onChange({target:{value}});render()},async submit(){await tree.props.onSubmit({preventDefault(){}});render()},async changeEmail(){nodes().find(n=>n.type==='button'&&n.props.children==='Use a different email').props.onClick();render()},failPassword(){passwordFailure={code:'invalid_credentials'}}}
}
test('review address opens password entry without requesting an email code',async()=>{
 const h=harness();h.field('email',' REVIEW@RURALCONNECTIONS.NZ ');await h.submit()
 assert.ok(h.nodes().some(n=>n.props?.id==='password'&&n.props.type==='password'))
 assert.equal(h.calls.length,0)
 h.field('password','test-only-value');await h.submit()
 assert.equal(h.calls[0][0],'password');assert.equal(h.calls[0][1].email,review.REVIEW_EMAIL)
 assert.deepEqual(h.redirects,['/jobs/example'])
})
test('failed review password stays on the form with a useful retry and no OTP request',async()=>{
 const h=harness();h.field('email',review.REVIEW_EMAIL);await h.submit();h.failPassword();h.field('password','test-only-value');await h.submit()
 assert.equal(h.redirects.length,0)
 assert.ok(h.nodes().some(n=>n.props?.role==='alert'&&n.props.children.includes('password was not recognised')))
 assert.ok(h.nodes().some(n=>n.type==='button'&&n.props.children==='Sign in'&&!n.props.disabled))
 assert.ok(h.calls.every(c=>c[0]==='password'))
 await h.changeEmail();assert.ok(!h.nodes().some(n=>n.props?.id==='password'))
})
test('normal accounts still request and verify email codes',async()=>{
 const h=harness();h.field('email','tester@example.test');await h.submit()
 assert.equal(h.calls[0][0],'otp');assert.ok(h.nodes().some(n=>n.props?.id==='token'))
 h.field('token','123456');await h.submit();assert.equal(h.calls[1][0],'verify')
 assert.deepEqual(h.redirects,['/jobs/example'])
})
