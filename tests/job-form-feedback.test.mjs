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
import {runSubmission} from '../shared/submission.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/app/jobs/new/job-form.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(storage,seed,{
 check=async()=>true,suggest=async()=>({data:{category:'Water & Drainage'}}),jobExists=false,
 photoEnabled=false,uploadPhoto=async()=>({checksum:'a'.repeat(64)}),privatePhotos,
}={}){
 const state=[],refs=[],effects=[],dependencies=[],cleanups=[],submissions=[],destinations=[]
 let index=0,refIndex=0,effectIndex=0,tree,actionState={error:''}
 const router={push:path=>destinations.push(path)}
 const jsx=(type,props)=>({type,props})
 const react={startTransition:fn=>fn(),useCallback:fn=>fn,useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial})},useEffect(fn,deps){if(!storage)return;const i=effectIndex++;if(!dependencies[i]||deps.some((value,n)=>value!==dependencies[i][n])){dependencies[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}},useActionState:()=>[actionState,data=>submissions.push(data),false]}
 const module={exports:{}}
 vm.runInNewContext(code,{exports:module.exports,require(name){
  if(name==='@shared/publicArea')return publicArea
 if(name==='@shared/postingText')return postingText
 if(name==='@shared/formatting')return formatting
 if(name==='@/components/date-input')return {DateInput:'input'}
 if(name==='@/components/job-address-input')return {JobAddressInput:'job-address'}
  if(name==='@/components/job-photo-draft')return {JobPhotoDraft:'job-photo-draft'}
  if(name==='@/components/job-edit-photos')return {JobEditPhotos:'job-edit-photos',JobEditPhotoImage:'job-edit-photo-image'}
  if(name==='@/components/job-text-draft')return {JobTextDraft:'job-text-draft',JobAiChoiceCopy:'job-ai-choice-copy'}
  if(name==='@/lib/job-primary-photo')return {prepareJobPhoto:async file=>file,jobPhotoRequest:uploadPhoto}
 if(name==='@/components/job-location-map')return {JobLocationMap:'job-map'}
 if(name==='react')return react
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx}
  if(name==='@shared/jobDraft')return jobDraft
  if(name==='@shared/postingDates')return dates
  if(name==='@shared/postingMoney')return money
  if(name==='@shared/categories')return categories
  if(name==='@shared/submission')return {runSubmission}
  if(name==='@/components/field-feedback')return {FieldFeedback:()=>null,invalidField:(name,message)=>({id:name,'aria-invalid':message?true:undefined,'aria-describedby':message?name+'-error':undefined})}
  if(name==='@/components/publishing-location-warning')return {usePublishingLocationWarning:()=>({prompt:null,check})}
  if(name==='next/navigation')return {useRouter:()=>router}
  if(name==='@/components/navigation-link')return {default:'a'}
  if(name==='@/lib/job-input')return {SCHEDULES:{flexible:'Flexible',specific:'Specific date',range:'Date range'},MATERIALS:{none:'None'},ACCESS:{}}
  if(name==='@/lib/supabase/client')return {createClient:()=>({functions:{invoke:suggest},from:()=>({select:()=>({eq:(column,value)=>({maybeSingle:async()=>({data:jobExists?{id:value}:null,error:null})})})})})}
  if(name==='../../work-actions')return {}
  if(name==='@/lib/photo-thumbs')return {uploadThumbnail:async()=>true,removeThumbnails:async()=>{}}
  if(name==='@shared/categoryArtwork')return {categoryArtwork:()=>'/images/general.png'}
  if(name==='@shared/photos')return {removedThumbPaths:()=>[],thumbUrl:url=>url,fallbackImageSrc:()=>null}
  if(name==='@/lib/resize-photo')return {PHOTO_MAX:1600,AVATAR_MAX:512,resizePhoto:async file=>file}
  if(name==='lucide-react')return {LoaderCircle:()=>null}
  throw Error(name)
 },Date,console,process:{env:{NEXT_PUBLIC_PHOTO_TO_JOB:photoEnabled?'true':'false'}},AbortController,
 FormData:class {constructor(fields){Object.assign(this,fields)}set(key,value){this[key]=value}},
 sessionStorage:storage,crypto:{randomUUID:()=> 'test-job-id'},document:{querySelector:()=>null}})
 const render=()=>{index=0;refIndex=0;effectIndex=0;tree=module.exports.JobForm({userId:'test',seed,mode:seed?'edit':'new',privatePhotos});effects.splice(0).forEach(fn=>fn())}
 const nodes=(node=tree)=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).filter(c=>c!==undefined).flatMap(c=>nodes(c))]
 const text=node=>typeof node==='string'?node:[node?.props?.children].flat(Infinity).map(c=>typeof c==='object'?text(c):String(c??'')).join('')
 const click=label=>{nodes().find(n=>n.type==='button'&&(text(n)===label||label==='Next'&&text(n)==='Next — Location')).props.onClick();render()}
 const change=(id,value)=>{nodes().find(n=>n.props?.id===id).props.onChange({target:{value}});render()}
 function submit(){
  const fields=Object.fromEntries(nodes().filter(n=>n.type==='input'&&n.props.type==='hidden').map(n=>[n.props.name,n.props.value]))
  const result=tree.props.onSubmit({preventDefault(){},nativeEvent:{submitter:{id:'job-review-submit'}},currentTarget:fields})
  render()
  return result
 }
 render();return {nodes,click,change,submit,text,submissions,destinations,render,
  result(value){actionState=value;render();render()},
  async flush(){await Promise.resolve();render()},hasResume:()=>nodes().some(n=>n.type==='h2'&&text(n)==='Resume your draft?')}
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
test('Basics defaults to manual entry with one collapsed AI helper and preserves a manual title and photo',()=>{
 const h=harness(undefined,undefined,{photoEnabled:true})
 const disclosure=h.nodes().find(n=>n.type==='details'&&n.props.className==='job-ai-helper')
 assert.equal(disclosure.props.open,undefined)
 assert.match(h.text(disclosure),/Use AI to help create my job/)
 assert.ok(h.nodes().some(n=>n.type==='progress'&&n.props.value===1&&n.props.max===5))
 assert.ok(h.nodes().some(n=>n.props.type==='radio'&&n.props.name==='schedule_type'))
 const image={name:'gate.jpg'}
 h.change('job-title','Repair gate')
 h.nodes().find(n=>n.type==='job-photo-draft').props.onFile(image)
 h.render()
 h.nodes().find(n=>n.type==='job-text-draft').props.onUse({title:'Suggested title',description:'Fix the hinge.',category:'Fencing'})
 h.render()
 assert.equal(h.nodes().find(n=>n.props.id==='job-title').props.value,'Repair gate')
 assert.equal(h.nodes().find(n=>n.type==='job-photo-draft').props.file,image)
 assert.equal(categories.jobDraftCategory('Fencing'),'Fencing & Gates')
 h.click('Next — Location')
 assert.ok(h.nodes().some(n=>n.type==='h2'&&h.text(n)==='Location'))
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
test('private gallery changes stay local until Save and retry with the same staged ID',async()=>{
 const original={id:'old-photo',slot:0},replacement={id:'replacement',slot:0,file:{name:'gate.jpg'}}
 const uploads=[]
 let fail=true
 const h=harness(storageWith(),datedJob,{privatePhotos:[original],uploadPhoto:async(endpoint,file,id)=>{
  uploads.push({endpoint,id})
  if(fail)throw Error('Temporary upload failure')
  return {checksum:'a'.repeat(64)}
 }})
 await h.flush()
 h.click('Next');h.click('Next')
 const editor=h.nodes().find(n=>n.type==='job-edit-photos')
 assert.equal(editor.props.photos[0],original)
 editor.props.onChange([replacement]);h.render()
 assert.equal(uploads.length,0)
 h.click('Next');h.click('Next')
 await h.submit()
 h.render()
 assert.equal(h.submissions.length,0)
 fail=false
 await h.submit()
 assert.equal(uploads.length,2)
 assert.deepEqual(uploads[0],uploads[1])
 assert.equal(uploads[1].endpoint,'job-primary-media?action=stage-edit&job=edit-job')
 assert.deepEqual(JSON.parse(h.submissions[0].private_gallery),{
  expected:['old-photo'],photos:[{id:'replacement',slot:0,checksum:'a'.repeat(64)}],
 })
})
test('specific-date editing exposes the saved choice and submits exactly one matching timing field',()=>{
 const h=harness(undefined,datedJob)
 const timing=h.nodes().find(n=>n.props?.name==='schedule_type'&&n.props.checked)
 assert.equal(timing.props.value,'specific')
 assert.equal(timing.props.type,'radio')
 assert.equal(h.nodes().find(n=>n.props?.id==='job-scheduled_date').props.value,'2030-12-01')
 assert.equal(h.nodes().filter(n=>n.props?.name==='schedule_type'&&n.props.checked).length,1)
 h.click('Next')
 const submitted=h.nodes().filter(n=>n.props?.name==='schedule_type')
 assert.equal(submitted.length,1);assert.equal(submitted[0].props.value,'specific')
})
test('older missing-type date records select Specific; explicit Flexible stays Flexible',()=>{
 const inferred=harness(undefined,{...datedJob,schedule_type:null})
 assert.equal(inferred.nodes().find(n=>n.props?.name==='schedule_type'&&n.props.checked).props.value,'specific')
 const flexible=harness(undefined,{...datedJob,schedule_type:'flexible'})
 assert.equal(flexible.nodes().find(n=>n.props?.name==='schedule_type'&&n.props.checked).props.value,'flexible')
})

function reachReview(h){
 h.change('job-title','Repair a drain');h.click('Next')
 h.change('job-area','Waitoki');h.click('Next')
 h.change('job-description','Clear the blocked drain.');h.click('Next')
 h.click('Next')
}

test('Post job immediately goes busy, ignores duplicate submits and keeps the draft for retry',async()=>{
 let allow
 const location=new Promise(resolve=>{allow=resolve})
 const storage=storageWith()
 const h=harness(storage,undefined,{check:()=>location})
 await h.flush()
 reachReview(h)
 await h.flush()
 assert.ok(storage.getItem(draftKey))
 const button=()=>h.nodes().find(node=>node.props.id==='job-review-submit')
 const started=h.submit()
 assert.equal(button().props.disabled,true)
 assert.match(h.text(button()),/Posting job…/)
 assert.ok(h.nodes().some(node=>node.props.role==='status'&&h.text(node)==='Posting job…'))
 await h.submit()
 assert.equal(h.submissions.length,0)
 allow(true)
 await started
 await h.submit()
 assert.equal(h.submissions.length,1)
 assert.equal(h.submissions[0].job_id,'test-job-id')
 assert.equal(h.submissions[0].title,'Repair a drain')
 assert.equal(h.destinations.length,0)
 // The submitted snapshot owns the data now; success navigates server-side,
 // so the stored draft is dropped at dispatch…
 assert.equal(storage.getItem(draftKey),null)
 h.result({error:'The server could not save the job.'})
 // …and restored the moment a failure comes back.
 assert.equal(JSON.parse(storage.getItem(draftKey)).draft.title,'Repair a drain')
 assert.equal(button().props.disabled,false)
 assert.ok(h.nodes().some(node=>node.props.role==='alert'&&h.text(node)==='The server could not save the job.'))
 await h.submit()
 assert.equal(h.submissions.length,2)
 assert.deepEqual({...h.submissions[1]},{...h.submissions[0]})
 h.result({error:'',jobId:'test-job-id'})
 assert.equal(button().props.disabled,true)
 assert.ok(h.nodes().some(node=>node.props.role==='status'&&h.text(node)==='Saved. Opening your job…'))
 assert.deepEqual(h.destinations,['/jobs/test-job-id?posted=1'])
})

test('a saved draft that already became a job links to it instead of offering a repost',async()=>{
 const storage=storageWith(JSON.stringify({id:'already-posted-job',draft:{title:'Fix the woolshed tap'}}))
 const h=harness(storage,undefined,{jobExists:true})
 await h.flush()
 await h.flush()
 assert.equal(h.hasResume(),false)
 assert.ok(h.nodes().some(n=>n.type==='h2'&&h.text(n)==='Draft already posted'))
 assert.ok(h.nodes().some(n=>n.props?.href==='/jobs/already-posted-job'))
 assert.equal(storage.getItem(draftKey),null)
})

test('a saved draft with no matching job still offers to resume',async()=>{
 const storage=storageWith(JSON.stringify({id:'unposted-draft',draft:{title:'Fix the woolshed tap'}}))
 const h=harness(storage,undefined,{jobExists:false})
 await h.flush()
 await h.flush()
 assert.equal(h.hasResume(),true)
 assert.ok(!h.nodes().some(n=>n.type==='h2'&&h.text(n)==='Draft already posted'))
})

test('Review labels the automatic category, persists the override and does not suggest again',async()=>{
 let calls=0
 const storage=storageWith()
 const h=harness(storage,undefined,{suggest:async()=>{calls++;return {data:{category:'Water & Drainage'}}}})
 await h.flush()
 reachReview(h)
 await h.flush()
 const helper='Suggested from your description. Change if needed.'
 const category=()=>h.nodes().find(node=>node.type==='select')
 assert.equal(category().props.value,'Water & Drainage')
 assert.ok(h.nodes().some(node=>node.props.children===helper))
 category().props.onChange({target:{value:'Fencing & Gates'}})
 h.render()
 assert.equal(category().props.value,'Fencing & Gates')
 assert.ok(!h.nodes().some(node=>node.props.children===helper))
 h.click('3. Details & photos')
 h.change('job-description','Clear the drain near the fence.')
 h.click('5. Review')
 await h.flush()
 assert.equal(calls,1)
 assert.equal(category().props.value,'Fencing & Gates')
 assert.equal(JSON.parse(storage.getItem(draftKey)).draft.category,'Fencing & Gates')
 await h.submit()
 assert.equal(h.submissions[0].category,'Fencing & Gates')
})

test('photo posting requires an upload, retains a replacement on failure, and retries the same draft',async()=>{
 const attempted=[]
 const h=harness(storageWith(),undefined,{photoEnabled:true,uploadPhoto:async(endpoint,file,draft)=>{
  attempted.push({endpoint,file,draft})
  if(attempted.length===1)throw Error('Upload failed')
  return {checksum:'b'.repeat(64)}
 }})
 await h.flush()
 const pick=file=>{h.nodes().find(node=>node.type==='job-photo-draft').props.onFile(file);h.render()}
 pick({name:'first.jpg'})
 reachReview(h)
 await h.flush()
 pick(null)
 await h.submit()
 assert.equal(attempted.length,0)
 assert.equal(h.submissions.length,0)
 const replacement={name:'replacement.jpg'}
 pick(replacement)
 await h.submit()
 h.render()
 assert.equal(h.submissions.length,0)
 assert.equal(h.nodes().find(node=>node.type==='job-photo-draft').props.file,replacement)
 await h.submit()
 assert.deepEqual(attempted,Array(2).fill({endpoint:'job-primary-media',file:replacement,draft:'test-job-id'}))
 assert.equal(h.submissions[0].primary_photo_checksum,'b'.repeat(64))
 assert.equal(h.submissions[0].primary_photo_required,'on')
})
