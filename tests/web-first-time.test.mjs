import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const returnUrl=moduleUrl(await readFile(new URL('../provider-web/src/lib/return-path.ts',import.meta.url),'utf8'))
const helperUrl=moduleUrl((await readFile(new URL('../provider-web/src/lib/first-time.ts',import.meta.url),'utf8')).replace("'./return-path'",JSON.stringify(returnUrl)))
const {setupInput,setupDestination,normaliseEmail,validEmail,signInFailure}=await import(helperUrl)
const form=values=>{const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,v);return f}
test('setup validates public fields and never overwrites optional or privileged profile fields',()=>{
 assert.equal(setupInput(form({name:' ',region:'Waikato'})).ok,false)
 assert.equal(setupInput(form({name:'Paul',region:''})).ok,false)
 assert.deepEqual(setupInput(form({name:' Paul ',region:' Waikato ',role:'admin',phone:'secret'})).value,{full_name:'Paul',display_name:'Paul',region:'Waikato',onboarding_completed:true})
 assert.deepEqual(setupInput(form({intent:'later',name:''})).value,{onboarding_completed:true})
})
test('setup preserves intended destinations without external redirects or setup loops',()=>{
 assert.equal(setupDestination('/browse/abc/request?variant=one'),'/browse/abc/request?variant=one')
 for(const url of ['https://evil.test','//evil.test','/setup?next=/setup','/auth/callback','/login'])assert.equal(setupDestination(url),'/')
})
test('email validation and errors provide actionable copy without exposing raw errors',()=>{
 assert.equal(normaliseEmail(' Paul@Example.co.nz '),'paul@example.co.nz')
 for(const email of ['bad','a@','a b@c.nz'])assert.equal(validEmail(email),false)
 assert.equal(validEmail('paul@example.co.nz'),true)
 assert.match(signInFailure({status:429}),/Wait a few minutes/)
 assert.match(signInFailure({code:'otp_expired'},true),/Request a new code/)
 assert.match(signInFailure(null),/connection/)
})
let session,updates,fail
const mock={requireProvider:async()=>session,revalidatePath(){},redirect(path){throw new Error('REDIRECT:'+path)}}
globalThis.__firstTimeMock=mock
let actionSource=await readFile(new URL('../provider-web/src/app/setup/actions.ts',import.meta.url),'utf8')
actionSource=actionSource.replace(/import \{ redirect \} from 'next\/navigation'/,"const {redirect}=globalThis.__firstTimeMock").replace(/import \{ revalidatePath \} from 'next\/cache'/,"const {revalidatePath}=globalThis.__firstTimeMock").replace(/import \{ requireProvider \} from '@\/lib\/auth'/,"const {requireProvider}=globalThis.__firstTimeMock").replace("'@/lib/first-time'",JSON.stringify(helperUrl))
const {finishSetup}=await import(moduleUrl(actionSource))
function reset(){updates=[];fail=false;const q={update(value){updates.push(value);return q},eq(key,id){assert.equal(key,'id');assert.equal(id,'me');return q},select(){return q},single:async()=>fail?{error:{message:'offline'}}:{data:{id:'me'}}};session={user:{id:'me'},supabase:{from(table){assert.equal(table,'profiles');return q}}}}
test('failed profile save stays in setup; successful actions forward their destination',async()=>{
 reset();fail=true
 const result=await finishSetup({},form({name:'Paul',region:'Waikato',intent:'post_job'}));assert.match(result.error,/try again/)
 reset();await assert.rejects(finishSetup({},form({name:'Paul',region:'Waikato',intent:'post_job'})),/REDIRECT:\/jobs\/new/)
 reset();await assert.rejects(finishSetup({},form({name:'Paul',region:'Waikato',intent:'listings'})),/REDIRECT:\/browse/)
 reset();await assert.rejects(finishSetup({},form({intent:'later',next:'/messages?kind=listing&id=abc'})),/REDIRECT:\/messages\?kind=listing&id=abc/)
 assert.deepEqual(updates,[{onboarding_completed:true,primary_role:'both',role:'provider'}])
})
let authProfile,authError,authUser
const authQuery={select(){return authQuery},eq(key,id){assert.equal(key,'id');assert.equal(id,'me');return authQuery},maybeSingle:async()=>({data:authProfile,error:authError})}
globalThis.__firstTimeAuth={redirect:mock.redirect,createClient:async()=>({auth:{getUser:async()=>({data:{user:authUser}})},from(table){assert.equal(table,'profiles');return authQuery}})}
let authSource=await readFile(new URL('../provider-web/src/lib/auth.ts',import.meta.url),'utf8')
authSource=authSource.replace("import { redirect } from 'next/navigation'","const {redirect}=globalThis.__firstTimeAuth").replace("import { createClient } from '@/lib/supabase/server'","const {createClient}=globalThis.__firstTimeAuth").replace("'@/lib/return-path'",JSON.stringify(returnUrl))
const {requireProvider}=await import(moduleUrl(authSource))
test('authentication gates new members once, preserves the intended page, and fails honestly on profile errors',async()=>{
 authUser={id:'me'};authError=null;authProfile={id:'me',onboarding_completed:false}
 await assert.rejects(requireProvider('/messages?kind=listing&id=abc'),error=>error.message==='REDIRECT:/setup?next='+encodeURIComponent('/messages?kind=listing&id=abc'))
 assert.equal((await requireProvider('/setup',true)).user.id,'me')
 authProfile.onboarding_completed=true;assert.equal((await requireProvider('/jobs')).profile.id,'me')
 authError={message:'offline'};await assert.rejects(requireProvider(),/Could not load your profile/)
 authUser=null;await assert.rejects(requireProvider('/jobs/new'),/REDIRECT:\/login\?next=%2Fjobs%2Fnew/)
})
