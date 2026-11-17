import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as dates from '../shared/dates.ts'
import * as offers from '../shared/offers.ts'
import {jobReviewStatus} from '../shared/jobReviewStatus.ts'
import {signInMethodHint} from '../shared/reviewAccount.ts'

const require=createRequire(import.meta.url),ts=require('typescript')
const webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url))
const jsx=webRequire('react/jsx-runtime')
const source=path=>readFile(new URL(path,import.meta.url),'utf8')
function compile(source, imports){
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={}
 vm.runInNewContext(code,{exports,require(name){if(name==='react/jsx-runtime')return jsx;if(name in imports)return imports[name];throw Error(name)}})
 return exports
}
function nodes(node){
 if(!node||typeof node!=='object')return []
 if(Array.isArray(node))return node.flatMap(nodes)
 return [node,...nodes(node.props?.children)]
}

test('NZ offer dates display day/month/year and preserve the canonical date',()=>{
 assert.equal(dates.formatNzDateOnly('2026-03-07'),'07/03/2026')
 assert.equal(dates.parseNzDate('07/03/2026'),'2026-03-07')
 assert.equal(dates.parseNzDate('31/02/2026'),null)
 assert.equal(dates.formatNzDateOnly(null),'')
})

test('job review indicators keep each person and an unavailable lookup independent',()=>{
 assert.deepEqual(jobReviewStatus(true,false,'Provider'),['Your review: submitted','Provider review: not yet submitted'])
 assert.deepEqual(jobReviewStatus(false,true,'Requester'),['Your review: not yet submitted','Requester review: submitted'])
 assert.deepEqual(jobReviewStatus(undefined,true,'Provider'),[null,'Provider review: submitted'])
})

test('the initial login hint distinguishes email, password and email-code steps',()=>{
 assert.match(signInMethodHint(''),/Enter your email/)
 assert.match(signInMethodHint('review@ruralconnections.nz'),/password/)
 assert.match(signInMethodHint('user@example.invalid'),/email you a sign-in code/)
})

test('offer form keeps entered values and shows pricing guidance only for hourly',async()=>{
 const slots=[]
 let cursor=0,state={error:''}
 const {OfferForm}=compile(await source('../provider-web/src/app/jobs/[id]/offer-form.tsx'),{
  react:{useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>slots[i]=value]},useEffect(){},useRef:()=>({current:null}),useActionState:()=>[state,()=>{},false]},
  'next/navigation':{useRouter:()=>({refresh(){}})},
  '@/components/action-form':{useSubmitGuard:()=>()=>{}},
  '@/components/navigation-link':{default:'a'},
  '@shared/dates':dates,'@shared/offers':offers,
  '@shared/requestedDate':{offerDefaultDay:()=>null,requestedLabel:()=>''},
  '../../work-actions':{sendOffer(){},changeOffer(){}},
 })
 const render=(offer)=>{cursor=0;return nodes(OfferForm({jobId:'fixture',schedule:{},providerMaterials:false,offer}))}
 const field=(tree,name)=>tree.find(node=>node.props.name===name)
 const hasGuidance=tree=>tree.some(node=>node.props.children===offers.HOURLY_OFFER_GUIDANCE)
 const change=(name,value)=>field(render(),name).props.onChange({target:{value}})
 assert.equal(field(render(),'item_label').props.value,'')
 assert.equal(field(render(),'item_label').props.placeholder,'e.g. Labour')
 assert.equal(hasGuidance(render()),false)
 change('pricing_type','hourly')
 assert.equal(hasGuidance(render()),true)
 change('item_label','Fence repair')
 change('item_amount','25')
 change('available_from','07/03/2026')
 change('message','Test note')
 state={error:'Offer could not be saved'}
 const failed=render()
 assert.ok(failed.some(node=>node.props.role==='alert'&&node.props.children===state.error))
 for(const [name,value] of Object.entries({item_label:'Fence repair',item_amount:'25',available_from:'07/03/2026',message:'Test note'}))
  assert.equal(field(failed,name).props.value,value)
 assert.ok(failed.some(node=>node.type==='button'&&node.props.children==='Send offer'))
 change('pricing_type','per_unit')
 assert.equal(hasGuidance(render()),false)

 slots.length=0
 state={error:''}
 const editing=render({id:'offer',line_items:[{label:'Travel',amount:90}],available_from:'2026-03-07',pricing_type:'fixed'})
 assert.equal(field(editing,'item_label').props.value,'Travel')
 assert.equal(field(editing,'item_amount').props.value,'90')
 assert.equal(field(editing,'available_from').props.value,'07/03/2026')
})

test('standard web save guard blocks duplicates and allows a retry after failure',async()=>{
 const lock={current:false}
 let effect,prevented=0
 const {useSubmitGuard}=compile(await source('../provider-web/src/components/action-form.tsx'),{
  react:{useRef:()=>lock,useEffect:fn=>{effect=fn}},
 })
 const event={preventDefault(){prevented++}}
 const first=useSubmitGuard({error:''},false)
 effect()
 first(event);first(event)
 assert.equal(prevented,1)
 const retry=useSubmitGuard({error:'Save failed'},false)
 effect()
 retry(event)
 assert.equal(prevented,1)
})

test('new web arrival requires time; Change time retains the confirmed value',async()=>{
 const {ConfirmJob}=compile(await source('../provider-web/src/app/jobs/[id]/confirm-job.tsx'),{
  react:{useState(initial){return [typeof initial==='function'?initial():initial,()=>{}]},useEffect(){},useActionState:()=>[{error:''},()=>{},false]},
  'next/navigation':{useRouter:()=>({refresh(){}})},
  '@/components/action-form':{useSubmitGuard:()=>()=>{}},
  '@shared/formatting':{formatDateTime:()=> '7 March, 11:35 am'},
  '@shared/dates':dates,'@shared/offers':offers,
  '@shared/postingDates':{nzCalendarDay:()=>null},
  '@shared/requestedDate':{arrivalDayChoices:()=>({preselect:'2099-03-07',requestedLabel:'7 March',chips:[]}),arrivalDayNote:()=>({})},
  '../../work-actions':{confirmJob(){},changeJobArrival(){},setJobPaymentMethod(){}},
 })
 const props={bidId:'bid',jobId:'job',jobTitle:'Fixture',requesterFirst:'Sam',schedule:{},availableFrom:null,amount:25,pricingType:'fixed'}
 const fields=tree=>{
  const fieldset=tree.find(node=>typeof node.type==='function'&&node.type.name==='ArrivalFields')
  return nodes(fieldset.type(fieldset.props))
 }
 const fresh=nodes(ConfirmJob({...props,arrivalStart:null}))
 const freshFields=fields(fresh)
 const date=freshFields.find(node=>node.type==='input'&&node.props.type==='date')
 const time=freshFields.find(node=>node.type==='input'&&node.props.type==='time')
 assert.equal(date.props.value,'2099-03-07')
 assert.equal(time.props.value,'')
 assert.equal(time.props.required,true)
 assert.ok(fresh.some(node=>node.type==='button'&&node.props.children==='Confirm job'&&node.props.disabled))
 const saved=new Date(2099,2,7,11,35).toISOString()
 const confirmed=nodes(ConfirmJob({...props,arrivalStart:saved}))
 assert.ok(confirmed.some(node=>node.type==='summary'&&node.props.children==='Change time'))
 const edit=confirmed.find(node=>typeof node.type==='function'&&node.type.name==='ChangeTime')
 const editedFields=fields(nodes(edit.type(edit.props)))
 assert.equal(editedFields.find(node=>node.type==='input'&&node.props.type==='time').props.value,'11:35')
})
