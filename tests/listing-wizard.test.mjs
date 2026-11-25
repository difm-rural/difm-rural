import * as formatting from '../shared/formatting.js'
import * as postingText from '../shared/postingText.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as pricing from '../shared/listingPricing.ts'
import * as categories from '../shared/categories.ts'
import * as dates from '../shared/postingDates.ts'
import * as money from '../shared/postingMoney.ts'
import * as travel from '../shared/travelRange.ts'
import * as submission from '../shared/submission.ts'
import * as publicArea from '../shared/publicArea.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/app/listings/listing-form.tsx',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
// defer: queue state updates until the next render, as React does (an updater
// runs later, not inside the event handler).
function harness(patch={},{defer=false,supabase,mode='edit'}={}){
 const state=[],refs=[],calls=[],pending=[];let index=0,refIndex=0,tree
 const react={useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;const apply=value=>{state[i]=typeof value==='function'?value(state[i]):value};return [state[i],value=>defer?pending.push(()=>apply(value)):apply(value)]},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial})},useEffect(){},useMemo:fn=>fn()}
 const module={exports:{}}
 const modules={'@shared/listingPricing':pricing,'@shared/categories':categories,'@shared/postingDates':dates,'@shared/postingMoney':money,'@shared/travelRange':travel,'@shared/submission':submission,'@shared/publicArea':publicArea,'@shared/publicJobArea':{createPublicAreaCache:()=>async()=>null,lookupPublicArea:async()=>null},'@/lib/resize-photo':{resizePhoto:async file=>file},'@/lib/photo-thumbs':{uploadThumbnail:async()=>true,removeThumbnails:async()=>{}},'@shared/categoryArtwork':{categoryArtwork:()=>'/images/general.png'},'@shared/photos':{removedThumbPaths:()=>[],thumbUrl:url=>url,fallbackImageSrc:()=>null}}
 vm.runInNewContext(compiled,{exports:module.exports,require(name){
 if(name==='@shared/postingText')return postingText
 if(name==='@shared/formatting')return formatting
 if(name==='@/components/date-input')return {DateInput:'input'}
 if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
 if(name in modules)return modules[name]
 if(name==='next/navigation')return {useRouter:()=>({push:path=>calls.push('navigate:'+path),refresh:()=>calls.push('refresh')})}
 if(name==='@/lib/supabase/client')return {createClient:()=>supabase??({from:()=>{calls.push('database');throw Error('Unexpected database call')}})}
 if(name==='@/components/publishing-location-warning')return {usePublishingLocationWarning:()=>({check:async()=>{calls.push('location');return true},prompt:null})}
 if(name==='@/components/field-feedback')return {FieldFeedback:()=>null,invalidField:(name,message)=>({id:name,'aria-invalid':message?true:undefined,'aria-describedby':message?name+'-error':undefined})}
 if(name==='./listing-card')return {ListingCard:()=>null,CardImage:()=>null}
 if(name==='lucide-react')return new Proxy({},{get:()=>()=>null})
 throw Error(name)
 },URL,Date,console,crypto:{randomUUID:()=>'new-listing-id'}})
 const props=mode==='new'
  ? {mode:'new',userId:'test-user'}
  : {mode:'edit',userId:'test-user',listing:{id:'test-listing',kind:'service',title:'Move a container',category:'Transport & Delivery',description:'Local test',location_name:'Waitoki',pricing_type:'fixed',rate:50,photos:[],pricing_add_ons:[],pricing_variants:[],...patch}}
 function render(){while(pending.length)pending.shift()();index=0;refIndex=0;tree=module.exports.ListingForm(props)}
 function nodes(node=tree){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).filter(c=>c!==undefined).flatMap(c=>nodes(c))]}
 const text=node=>typeof node==='string'?node:[node?.props?.children].flat(Infinity).filter(c=>c!==undefined).map(c=>typeof c==='object'?text(c):String(c??'')).join('')
 render()
 return {calls,nodes,render,change(id,value){nodes().find(n=>n.props?.id===id).props.onChange({target:{value}});render()},heading:()=>text(nodes().find(n=>n.type==='h2'&&n.props.tabIndex===-1)),click(label){const button=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(button,label);button.props.onClick();render()},rate(value){nodes().find(n=>n.props?.id==='lf-rate').props.onChange({target:{value}});render()},alert:()=>text(nodes().find(n=>n.props?.role==='alert'))}
}
test('negative rate stays at Pricing with a validation message instead of advancing or fetching RSC',()=>{
 const h=harness();h.click('Next');assert.equal(h.heading(),'Pricing')
 h.rate('-5');h.click('Next');assert.equal(h.heading(),'Pricing');assert.match(h.alert(),/Rate must be/)
 assert.deepEqual(h.calls,[])
})
test('valid edit wizard Pricing to Photos to Location is entirely local',()=>{
 const h=harness();h.click('Next');h.rate('50');h.click('Next');assert.equal(h.heading(),'Photos')
 h.click('Next');assert.equal(h.heading(),'Location & availability')
 assert.deepEqual(h.calls,[])
})
test('missing listing fields are individually highlighted and linked to specific errors',()=>{
 const h=harness({title:'',category:''});h.click('Next')
 for(const id of ['lf-title']){
  const input=h.nodes().find(n=>n.props?.id===id)
  assert.equal(input.props['aria-invalid'],true)
  assert.equal(input.props['aria-describedby'],id+'-error')
 }
 assert.match(h.alert(),/listing title/)
 h.change('lf-title','Topping');assert.equal(h.nodes().find(n=>n.props?.id==='lf-title').props['aria-invalid'],undefined)
 h.click('Next');assert.equal(h.heading(),'Pricing')
})
test('completed listing steps can be revisited, while untouched steps remain disabled',()=>{
 const h=harness();h.click('Next');h.click('Next');assert.equal(h.heading(),'Photos')
 h.click('✓Listing details');assert.equal(h.heading(),'Listing details')
 const pricing=h.nodes().find(n=>n.type==='button'&&n.props.children?.[1]==='Pricing')
 assert.equal(pricing.props.disabled,false)
 const review=h.nodes().find(n=>n.type==='button'&&n.props.children?.[1]==='Review')
 assert.equal(review.props.disabled,true)
})

test('listing text controls expose limits and block an overlong prefilled title before Pricing',()=>{
 const h=harness({title:'x'.repeat(401)});h.click('Next')
 assert.equal(h.heading(),'Listing details');assert.match(h.alert(),/Title must be 160/)
 assert.equal(h.nodes().find(n=>n.props?.id==='lf-title').props.maxLength,160)
 assert.equal(h.nodes().find(n=>n.props?.id==='lf-desc').props.maxLength,2000)
})
test('overlong listing descriptions must be corrected without silently truncating them',()=>{
 const h=harness({description:'x'.repeat(3000)});h.click('Next')
 assert.match(h.alert(),/Description must be 2,000/)
 assert.equal(h.nodes().find(n=>n.props?.id==='lf-desc').props.value.length,3000)
})

test('rate preview only renders valid prices, including the new exact limit',()=>{
 const h=harness();h.click('Next')
 const preview=()=>h.nodes().find(n=>n.props?.className==='lform-preview')
 for(const rate of ['', '999999999999', '1000000.01', '12.345', '-1']){
  h.rate(rate);assert.equal(preview(),undefined)
 }
 h.rate('1000000.00');assert.ok(preview());h.click('Next');assert.equal(h.heading(),'Photos')
})

// ---- Photos: picked files show as thumbnails ----
// The browser's FileList is live: clearing the input (value = '') right after
// onChange empties it. Reproduce that, so a deferred read would see nothing.
function pickEvent(files){
 let items=[...files]
 const list={get length(){return items.length},item:i=>items[i],[Symbol.iterator]:function*(){yield* items}}
 files.forEach((_,i)=>Object.defineProperty(list,i,{get:()=>items[i]}))
 return {target:{files:list,set value(v){if(v==='')items=[]},get value(){return items.length?'picked.jpg':''}}}
}
function photoHarness(){
 const created=[],revoked=[]
 const realCreate=URL.createObjectURL,realRevoke=URL.revokeObjectURL
 URL.createObjectURL=blob=>{const url='blob:test/'+created.length;created.push(url);return url}
 URL.revokeObjectURL=url=>{revoked.push(url)}
 const h=harness({},{defer:true})
 const input=()=>h.nodes().find(n=>n.type==='input'&&n.props?.type==='file')
 const pick=files=>{const e=pickEvent(files);input().props.onChange(e);h.render()}
 const thumbs=()=>h.nodes().filter(n=>n.type==='img'&&/^Listing photo \d+$/.test(String(n.props?.alt))).map(n=>n.props.src)
 const editThumbs=()=>h.nodes().filter(n=>n.props?.className==='lform-photo'&&n.props.children?.some?.(c=>c?.props?.className==='lform-photo-remove'))
 const restore=()=>{URL.createObjectURL=realCreate;URL.revokeObjectURL=realRevoke}
 return {h,pick,thumbs,editThumbs,created,revoked,restore}
}
const photo=name=>new File(['x'],name,{type:'image/jpeg'})
test('picking one photo shows its thumbnail even though the input is cleared straight away',()=>{
 const p=photoHarness()
 try{
  p.pick([photo('a.jpg')])
  assert.equal(p.editThumbs().length,1)
  assert.ok(p.thumbs().every(src=>src==='blob:test/0'))
 }finally{p.restore()}
})
test('picking three photos shows three thumbnails, each with one preview URL',()=>{
 const p=photoHarness()
 try{
  p.pick([photo('a.jpg'),photo('b.jpg'),photo('c.jpg')])
  assert.equal(p.editThumbs().length,3)
  assert.deepEqual(p.created,['blob:test/0','blob:test/1','blob:test/2'])
  p.h.render();p.h.render()
  assert.equal(p.created.length,3,'re-rendering makes no new URLs')
  assert.deepEqual(p.revoked,[],'and revokes none')
 }finally{p.restore()}
})
test('re-picking the same file adds it again, and the 4-photo cap holds',()=>{
 const p=photoHarness()
 try{
  const same=photo('same.jpg')
  p.pick([same]);p.pick([same])
  assert.equal(p.editThumbs().length,2)
  p.pick([photo('b.jpg'),photo('c.jpg'),photo('d.jpg')])
  assert.equal(p.editThumbs().length,4,'only room for two more')
  assert.equal(p.created.length,4,'no URL made for a photo that did not fit')
 }finally{p.restore()}
})
// ---- Publishing: one row per draft, and a confirmation on My listings ----
// The services row for a NEW listing carries a client-chosen id, so a retry
// after a lost insert response adopts the row it already created.
function saveStub({insertError=null,ownedRow=null}={}){
 const calls=[]
 const client={
  from(){
   const q={
    insert(payload){calls.push(['insert',payload]);return Promise.resolve({error:insertError})},
    select(){return q},eq(){return q},
    maybeSingle(){calls.push(['lookup']);return Promise.resolve({data:ownedRow,error:null})},
    update(patch){calls.push(['update',patch]);return q},
   }
   return q
  },
 }
 return {client,calls}
}
async function publishNewHireListing(stub){
 const h=harness({},{mode:'new',supabase:stub.client})
 h.click('Hire')
 h.change('lf-title','Trailer hire')
 h.click('Next')
 h.rate('120')
 h.click('Next')
 h.click('Next')
 h.change('lf-location','Waitoki')
 h.click('Review listing')
 const publish=h.nodes().find(n=>n.type==='button'&&[n.props.children].flat(Infinity).includes('Publish listing'))
 assert.ok(publish,'Publish listing button')
 await publish.props.onClick()
 h.render()
 return h
}
test('markup in a listing area stays on Location and is not saved',async()=>{
 const stub=saveStub()
 const h=harness({},{mode:'new',supabase:stub.client})
 h.click('Hire')
 h.change('lf-title','Trailer hire')
 h.click('Next')
 h.rate('120')
 h.click('Next')
 h.click('Next')
 h.change('lf-location','<b>Waitoki</b> & "quotes" 😀')
 h.click('Review listing')
 assert.equal(h.heading(),'Location & availability')
 assert.match(h.alert(),/town or area/)
 assert.deepEqual(stub.calls,[])
 const publish=h.nodes().find(n=>n.type==='button'&&[n.props.children].flat(Infinity).includes('Publish listing'))
 assert.equal(publish,undefined)
})
test('publishing a new listing creates one row and confirms on My listings',async()=>{
 const stub=saveStub()
 const h=await publishNewHireListing(stub)
 assert.deepEqual(stub.calls.map(c=>c[0]),['insert'])
 assert.equal(stub.calls[0][1].id,'new-listing-id')
 assert.ok(h.calls.includes('navigate:/listings?published=1'))
})
test('a lost create response adopts the owned row instead of publishing a duplicate',async()=>{
 const stub=saveStub({insertError:{code:'23505'},ownedRow:{id:'new-listing-id'}})
 const h=await publishNewHireListing(stub)
 // One insert attempt, then an ownership check — never a second insert.
 assert.deepEqual(stub.calls.map(c=>c[0]),['insert','lookup'])
 assert.ok(h.calls.includes('navigate:/listings?published=1'))
 assert.equal(h.alert(),'')
})
test('a create that fails for another reason keeps the provider on the form',async()=>{
 const stub=saveStub({insertError:{code:'08006'}})
 const h=await publishNewHireListing(stub)
 assert.deepEqual(stub.calls.map(c=>c[0]),['insert'])
 assert.ok(!h.calls.some(call=>call.startsWith('navigate:/listings?')))
 assert.match(h.alert(),/create/)
})
test('My listings announces a publish and an edit separately',async()=>{
 const page=await readFile(new URL('../provider-web/src/app/listings/page.tsx',import.meta.url),'utf8')
 assert.match(page,/published === '1'[\s\S]{0,120}Listing published\./)
 assert.match(page,/saved === '1'[\s\S]{0,120}Listing changes saved\./)
})

test('removing a photo drops its thumbnail and revokes only its URL',()=>{
 const p=photoHarness()
 try{
  p.pick([photo('a.jpg'),photo('b.jpg'),photo('c.jpg')])
  const remove=p.h.nodes().find(n=>n.type==='button'&&n.props?.['aria-label']==='Remove photo 2')
  remove.props.onClick();p.h.render()
  assert.equal(p.editThumbs().length,2)
  assert.deepEqual(p.revoked,['blob:test/1'])
  const shown=p.editThumbs().map(t=>t.props.children.find(c=>c?.type==='img').props.src)
  assert.deepEqual(shown,['blob:test/0','blob:test/2'])
 }finally{p.restore()}
})
