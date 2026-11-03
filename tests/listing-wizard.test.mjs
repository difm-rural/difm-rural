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
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/app/listings/listing-form.tsx',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(patch={}){
 const state=[],refs=[],calls=[];let index=0,refIndex=0,tree
 const react={useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial})},useEffect(){},useMemo:fn=>fn()}
 const module={exports:{}}
 const modules={'@shared/listingPricing':pricing,'@shared/categories':categories,'@shared/postingDates':dates,'@shared/postingMoney':money,'@shared/travelRange':travel,'@shared/submission':submission}
 vm.runInNewContext(compiled,{exports:module.exports,require(name){
 if(name==='@shared/postingText')return postingText
 if(name==='@shared/formatting')return formatting
 if(name==='@/components/date-input')return {DateInput:'input'}
 if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
 if(name in modules)return modules[name]
 if(name==='next/navigation')return {useRouter:()=>({push:()=>calls.push('navigate'),refresh:()=>calls.push('refresh')})}
 if(name==='@/lib/supabase/client')return {createClient:()=>({from:()=>{calls.push('database');throw Error('Unexpected database call')}})}
 if(name==='@/components/publishing-location-warning')return {usePublishingLocationWarning:()=>({check:async()=>{calls.push('location');return true},prompt:null})}
 if(name==='@/components/field-feedback')return {FieldFeedback:()=>null,invalidField:(name,message)=>({id:name,'aria-invalid':message?true:undefined,'aria-describedby':message?name+'-error':undefined})}
 if(name==='./listing-card')return {ListingCard:()=>null,CardImage:()=>null}
 if(name==='lucide-react')return new Proxy({},{get:()=>()=>null})
 throw Error(name)
 },URL,Date,console})
 const props={mode:'edit',userId:'test-user',listing:{id:'test-listing',kind:'service',title:'Move a container',category:'Transport & Delivery',description:'Local test',location_name:'Waitoki',pricing_type:'fixed',rate:50,photos:[],pricing_add_ons:[],pricing_variants:[],...patch}}
 function render(){index=0;refIndex=0;tree=module.exports.ListingForm(props)}
 function nodes(node=tree){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).filter(c=>c!==undefined).flatMap(c=>nodes(c))]}
 const text=node=>typeof node==='string'?node:[node?.props?.children].flat(Infinity).filter(c=>c!==undefined).map(c=>typeof c==='object'?text(c):String(c??'')).join('')
 render()
 return {calls,nodes,change(id,value){nodes().find(n=>n.props?.id===id).props.onChange({target:{value}});render()},heading:()=>text(nodes().find(n=>n.type==='h2'&&n.props.tabIndex===-1)),click(label){const button=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(button,label);button.props.onClick();render()},rate(value){nodes().find(n=>n.props?.id==='lf-rate').props.onChange({target:{value}});render()},alert:()=>text(nodes().find(n=>n.props?.role==='alert'))}
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
 for(const id of ['lf-title','lf-category']){
  const input=h.nodes().find(n=>n.props?.id===id)
  assert.equal(input.props['aria-invalid'],true)
  assert.equal(input.props['aria-describedby'],id+'-error')
 }
 assert.match(h.alert(),/listing title/)
 h.change('lf-title','Topping');assert.equal(h.nodes().find(n=>n.props?.id==='lf-title').props['aria-invalid'],undefined)
 h.click('Next');assert.match(h.alert(),/listing category/)
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
