import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/components/web-alerts.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const tick=()=>new Promise(resolve=>setImmediate(resolve))
async function poll(refreshPage){
 let interval,timeout,cleanup,refreshes=0,reads=0,counts
 const channel={on(){return channel},subscribe(){return channel}}
 const client={auth:{getUser:async()=>({data:{user:{id:'test-user'}}})},from(){reads++;const q={select(){return q},eq(){return q},then(resolve){return Promise.resolve({count:2,error:null}).then(resolve)}};return q},channel:()=>channel,removeChannel:async()=>{}}
 const module={exports:{}}
 vm.runInNewContext(code,{exports:module.exports,require(name){if(name==='react')return {useEffect:fn=>cleanup=fn(),useState:()=>[null,value=>counts=value]};if(name==='next/navigation')return {useRouter:()=>({refresh:()=>refreshes++})};if(name==='@/lib/supabase/client')return {createClient:()=>client};throw Error(name)},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},crypto:{randomUUID:()=> 'local-test'},setInterval:fn=>{interval=fn;return 1},clearInterval(){},setTimeout:fn=>{timeout=fn;return 1},clearTimeout(){}})
 module.exports.useWebAlerts(true,refreshPage)
 await tick();const before=reads
 interval();timeout();await tick()
 const result={refreshes,reads,before,counts};cleanup();return result
}
test('wizard polling updates badges without refreshing the page or interrupting edits',async()=>{
 const result=await poll(false)
 assert.equal(result.refreshes,0);assert.ok(result.reads>result.before);assert.ok(result.counts)
})
test('normal screens retain automatic refresh for incoming activity',async()=>{
 const result=await poll(true)
 assert.equal(result.refreshes,1);assert.ok(result.reads>result.before)
})
