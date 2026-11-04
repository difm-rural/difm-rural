import * as formatting from '../shared/formatting.js'
import * as publicArea from '../shared/publicArea.ts'
import * as postingText from '../shared/postingText.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as jobDraft from '../shared/jobDraft.ts'
import * as dates from '../shared/postingDates.ts'
import * as money from '../shared/postingMoney.ts'
import * as categories from '../shared/categories.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/app/jobs/new/job-form.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(storage,seed){
 const state=[],refs=[],effects=[],dependencies=[];let index=0,refIndex=0,effectIndex=0,tree
 const jsx=(type,props)=>({type,props})
 const react={useCallback:fn=>fn,useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial})},useEffect(fn,deps){if(!storage)return;const i=effectIndex++;if(!dependencies[i]||deps.some((value,n)=>value!==dependencies[i][n])){dependencies[i]=deps;effects.push(fn)}},useActionState:()=>[{error:''},()=>{},false]}
 const module={exports:{}}
 vm.runInNewContext(code,{exports:module.exports,require(name){
  if(name==='@shared/publicArea')return publicArea
 if(name==='@shared/postingText')return postingText
 if(name==='@shared/formatting')return formatting
 if(name==='@/components/job-card-image')return {JobCardImage:'job-card-image'}
 if(name==='@/components/date-input')return {DateInput:'input'}
 if(name==='@/components/job-address-input')return {JobAddressInput:'job-address'}
 if(name==='@/components/job-location-map')return {JobLocationMap:'job-map'}
 if(name==='react')return react
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx}
  if(name==='@shared/jobDraft')return jobDraft
  if(name==='@shared/postingDates')return dates
  if(name==='@shared/postingMoney')return money
  if(name==='@shared/categories')return categories
  if(name==='@shared/submission')return {}
  if(name==='@/components/field-feedback')return {FieldFeedback:()=>null,invalidField:(name,message)=>({id:name,'aria-invalid':message?true:undefined,'aria-describedby':message?name+'-error':undefined})}
  if(name==='@/components/publishing-location-warning')return {usePublishingLocationWarning:()=>({prompt:null})}
  if(name==='next/navigation')return {useRouter:()=>({})}
  if(name==='@/components/navigation-link')return {default:'a'}
  if(name==='@/lib/job-input')return {SCHEDULES:{flexible:'Flexible',specific:'Specific date',range:'Date range'},MATERIALS:{none:'None'},ACCESS:{}}
  if(name==='@/lib/supabase/client'||name==='../../work-actions')return {}
  if(name==='lucide-react')return {LoaderCircle:()=>null}
  throw Error(name)
 },Date,console,sessionStorage:storage,crypto:{randomUUID:()=> 'test-job-id'},document:{querySelector:()=>null}})
 const render=()=>{index=0;refIndex=0;effectIndex=0;tree=module.exports.JobForm({userId:'test',seed,mode:seed?'edit':'new'});effects.splice(0).forEach(fn=>fn())}
 const nodes=(node=tree)=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).filter(c=>c!==undefined).flatMap(c=>nodes(c))]
 const text=node=>typeof node==='string'?node:[node?.props?.children].flat(Infinity).map(c=>typeof c==='object'?text(c):String(c??'')).join('')
 const click=label=>{nodes().find(n=>n.type==='button'&&text(n)===label).props.onClick();render()}
 const change=(id,value)=>{nodes().find(n=>n.props?.id===id).props.onChange({target:{value}});render()}
 render();return {nodes,click,change,async flush(){await Promise.resolve();render()},hasResume:()=>nodes().some(n=>n.type==='h2'&&text(n)==='Resume your draft?')}
}
test('job validation names and highlights every missing field, and clears corrected fields',()=>{
 const h=harness();h.click('Next')
 for(const name of ['title']){
  const input=h.nodes().find(n=>n.props?.id==='job-'+name)
  assert.equal(input.props['aria-invalid'],true)
  assert.equal(input.props['aria-describedby'],'job-'+name+'-error')
  assert.ok(h.nodes().some(n=>n.props?.name==='job-'+name&&n.props.message.includes(name)))
 }
 h.change('job-title','Repair fence')
 assert.equal(h.nodes().find(n=>n.props?.id==='job-title').props['aria-invalid'],undefined)
})
test('date and area errors are associated with the relevant job controls',()=>{
 const h=harness();h.change('job-title','Repair fence');h.change('job-schedule_type','specific');h.click('Next')
 assert.equal(h.nodes().find(n=>n.props?.id==='job-scheduled_date').props['aria-invalid'],true)
 h.change('job-schedule_type','flexible');h.click('Next');h.change('job-area','<b>Waitoki</b>');h.click('Next')
 assert.equal(h.nodes().find(n=>n.props?.id==='job-area').props['aria-invalid'],true)
})
test('job stepper can return to a previously reached step after going back',()=>{
 const h=harness();h.change('job-title','Repair fence');h.click('Next');h.click('1. The job')
 const button=h.nodes().find(n=>n.type==='button'&&n.props.children?.[2]==='Location')
 assert.equal(button.props.disabled,false)
})

const draftKey='rural-job:test:new:new:public'
const storageWith=raw=>{
 const values=new Map(raw?[[draftKey,raw]]:[])
 return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values}
}
test('opening and revisiting an untouched web job form does not save or prompt for an empty draft',async()=>{
 const storage=storageWith();const first=harness(storage);await first.flush()
 assert.equal(first.hasResume(),false);assert.equal(storage.values.size,0)
 const second=harness(storage);await second.flush()
 assert.equal(second.hasResume(),false);assert.equal(storage.values.size,0)
})
test('legacy empty draft is cleared and the title field is enabled immediately',async()=>{
 const storage=storageWith(JSON.stringify({id:'old-id',draft:{title:'',description:'',category:'',schedule_type:'flexible',price_type:'open'}}))
 const h=harness(storage);await h.flush()
 assert.equal(h.hasResume(),false);assert.equal(storage.values.size,0)
 assert.equal(h.nodes().find(n=>n.type==='fieldset').props.disabled,false)
})
test('real job edits are saved and offered on the next visit',async()=>{
 const storage=storageWith();const first=harness(storage);await first.flush();first.change('job-title','Repair the fence')
 assert.ok(storage.getItem(draftKey))
 const second=harness(storage);await second.flush();assert.equal(second.hasResume(),true)
 second.click('Resume draft')
 assert.equal(second.nodes().find(n=>n.props?.id==='job-title').props.value,'Repair the fence')
 assert.equal(second.hasResume(),false)
 second.change('job-title','')
 assert.equal(storage.getItem(draftKey),null)
})

test('discarding a real draft does not immediately recreate an empty one',async()=>{
 const storage=storageWith(JSON.stringify({id:'old-id',draft:{title:'Fence repair'}}))
 const h=harness(storage);await h.flush();assert.equal(h.hasResume(),true)
 h.click('Discard saved draft');assert.equal(storage.getItem(draftKey),null)
 const next=harness(storage);await next.flush();assert.equal(next.hasResume(),false)
})

test('job controls expose counters and length limits, and validate overlong restored values',()=>{
 const h=harness();h.change('job-title','x'.repeat(161));h.click('Next')
 const title=h.nodes().find(n=>n.props?.id==='job-title')
 assert.equal(title.props.maxLength,160);assert.equal(title.props['aria-invalid'],true)
 assert.ok(h.nodes().some(n=>n.type==='small'&&n.props.children?.[0]===161))
 h.change('job-title','Repair fence');h.click('Next')
 h.change('job-area','Waitoki');h.click('Next');h.change('job-description','x'.repeat(3000));h.click('Next')
 const description=h.nodes().find(n=>n.props?.id==='job-description')
 assert.equal(description.props.maxLength,2000);assert.equal(description.props['aria-invalid'],true)
})

test('invalid public area is highlighted and cannot advance to Details',()=>{
 const h=harness();h.change('job-title','Repair fence');h.click('Next')
 h.change('job-area','<b>Waitoki</b> & "quotes" 😀');h.click('Next')
 assert.equal(h.nodes().find(n=>n.props?.id==='job-area').props['aria-invalid'],true)
 h.change('job-area','Te Kūiti');h.click('Next')
 assert.ok(h.nodes().find(n=>n.props?.id==='job-description'))
})

const datedJob={id:'edit-job',title:'Repair fence',description:'Fence repair',category:categories.CATEGORIES[0],schedule_type:'specific',scheduled_date:'2030-12-01',location_area:'Waitoki'}
test('specific-date editing exposes the saved choice and submits exactly one matching timing field',()=>{
 const h=harness(undefined,datedJob)
 const timing=h.nodes().find(n=>n.props?.id==='job-schedule_type')
 assert.equal(timing.props.value,'specific')
 assert.ok(h.nodes().some(n=>n.type==='option'&&n.props.value==='specific'))
 assert.equal(h.nodes().find(n=>n.props?.id==='job-scheduled_date').props.value,'2030-12-01')
 assert.equal(h.nodes().filter(n=>n.props?.name==='schedule_type').length,1)
 h.click('Next')
 const submitted=h.nodes().filter(n=>n.props?.name==='schedule_type')
 assert.equal(submitted.length,1);assert.equal(submitted[0].props.value,'specific')
})
test('older missing-type date records select Specific; explicit Flexible stays Flexible',()=>{
 const inferred=harness(undefined,{...datedJob,schedule_type:null})
 assert.equal(inferred.nodes().find(n=>n.props?.id==='job-schedule_type').props.value,'specific')
 const flexible=harness(undefined,{...datedJob,schedule_type:'flexible'})
 assert.equal(flexible.nodes().find(n=>n.props?.id==='job-schedule_type').props.value,'flexible')
})
