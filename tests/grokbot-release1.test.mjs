import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as arrivalTime from '../shared/arrivalTime.ts'
import {formatWorkDate,formatWorkDateTime} from '../shared/formatting.js'
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
 vm.runInNewContext(code,{exports,process,performance,require(name){if(name==='react/jsx-runtime')return jsx;if(name in imports)return imports[name];throw Error(name)}})
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
 let state={error:''},preselect='2099-03-07'
 const {ConfirmJob}=compile(await source('../provider-web/src/app/jobs/[id]/confirm-job.tsx'),{
  react:{useState(initial){return [typeof initial==='function'?initial():initial,()=>{}]},useEffect(){},useActionState:()=>[state,()=>{},false]},
  'next/navigation':{useRouter:()=>({refresh(){}})},
  '@/components/action-form':{useSubmitGuard:()=>()=>{}},
  '@shared/formatting':{formatWorkDateTime:()=> '7 March, 11:35 am'},
  '@shared/arrivalTime':{...arrivalTime,arrivalInputValue:date=>arrivalTime.arrivalInputValue(new Date(+date))},'@shared/offers':offers,
  '@shared/postingDates':{nzToday:()=> '2099-03-01'},
  '@shared/requestedDate':{arrivalDayChoices:()=>({preselect,requestedLabel:'7 March',chips:[]}),arrivalDayNote:()=>({})},
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
 const saved=arrivalTime.parseArrivalInput('2099-03-07T11:35').toISOString()
 preselect=null
 state={error:'Could not confirm the job.'}
 const failed=nodes(ConfirmJob({...props,arrivalStart:null}))
 assert.equal(fields(failed).find(node=>node.props.type==='date').props.value,'')
 assert.ok(failed.some(node=>node.props.role==='alert'&&node.props.children===state.error))
 assert.ok(!failed.some(node=>node.props.role==='status'))
 state={error:'',success:'Job confirmed.',arrivalStart:saved}
 const confirmedFromAction=nodes(ConfirmJob({...props,arrivalStart:null}))
 assert.ok(confirmedFromAction.some(node=>node.props.role==='status'&&node.props.children==='Job confirmed.'))
 assert.ok(!confirmedFromAction.some(node=>node.type==='form'))
 state={error:''}
 const confirmed=nodes(ConfirmJob({...props,arrivalStart:saved}))
 assert.ok(confirmed.some(node=>node.type==='summary'&&node.props.children==='Change time'))
 const edit=confirmed.find(node=>typeof node.type==='function'&&node.type.name==='ChangeTime')
 const editedFields=fields(nodes(edit.type(edit.props)))
 assert.equal(editedFields.find(node=>node.type==='input'&&node.props.type==='time').props.value,'11:35')
})

test('Auckland weekdays and times survive midnight, month boundaries and both offsets',()=>{
 assert.equal(formatWorkDate('2026-11-19'),'Thu 19 Nov 2026')
 for (const [entry,iso,label] of [
  ['2026-11-19T10:00','2026-11-18T21:00:00.000Z','Thu 19 Nov 2026, 10:00 am'],
  ['2026-07-01T00:05','2026-06-30T12:05:00.000Z','Wed 1 Jul 2026, 12:05 am'],
  ['2026-12-01T00:05','2026-11-30T11:05:00.000Z','Tue 1 Dec 2026, 12:05 am'],
 ]) {
  assert.equal(arrivalTime.parseArrivalInput(entry).toISOString(),iso)
  assert.equal(arrivalTime.arrivalInputValue(new Date(iso)),entry)
  assert.equal(formatWorkDateTime(iso),label)
 }
 assert.equal(arrivalTime.parseArrivalInput('2026-09-27T02:30'),null)
 assert.equal(arrivalTime.parseArrivalInput('2026-04-05T02:30').toISOString(),'2026-04-04T13:30:00.000Z')
 assert.equal(arrivalTime.parseArrivalInput('2026-04-05T02:30','2026-04-04T14:30:00Z').toISOString(),'2026-04-04T14:30:00.000Z')
})

test('review star targets contain individually named, ascending native radios',async()=>{
 const {StarRatingInput}=compile(await source('../provider-web/src/components/star-rating-input.tsx'),{})
 const changes=[]
 const picker=nodes(StarRatingInput({rating:3,onRating:value=>changes.push(value)}))
 const labels=picker.filter(node=>node.type==='label')
 assert.equal(labels.length,5)
 for (const [index,label] of labels.entries()) {
  const value=index+1
  const radio=nodes(label).find(node=>node.type==='input')
  assert.equal(radio.props.type,'radio')
  assert.equal(radio.props.value,value)
  assert.equal(radio.props.checked,value===3)
  assert.equal(radio.props['aria-label'],value===1?'1 star':value+' stars')
  radio.props.onChange()
 }
 assert.deepEqual(changes,[1,2,3,4,5])
})

test('posting keeps a validated explicit category and only suggests when it is absent',async()=>{
 const categories=['Fencing & Gates','Property & House Sitting','General Rural Help']
 const saved=[]
 let classified=0
 const {postJob}=compile(await source('../provider-web/src/app/work-actions.ts'),{
  '@shared/categories':{CATEGORIES:categories},
  'next/navigation':{},'next/cache':{revalidatePath(){}},
  '@/lib/auth':{requireProvider:async()=>({user:{id:'requester'},supabase:{
   from:()=>({
    select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})}),
    insert:async payload=>{saved.push(payload);return {}},
   }),
   functions:{invoke:async()=>{classified++;return {data:{category:'Fencing & Gates'}}}},
  }})},
  '@/lib/job-input':{validId:value=>value==='job',jobInput:()=>({ok:true,value:{title:'Repair a gate',description:'Replace two hinges'}})},
  '@shared/flowFeedback':{},'@shared/photos':{},'@shared/dates':dates,'@/lib/offer-input':{},'@/lib/booking-detail':{},
 })
 const data=new FormData()
 data.set('job_id','job')
 data.set('category','Property & House Sitting')
 assert.equal((await postJob({error:''},data)).jobId,'job')
 assert.equal(saved[0].category,'Property & House Sitting')
 assert.equal(classified,0)
 data.set('category','Invented category')
 assert.match((await postJob({error:''},data)).error,/existing job category/)
 assert.equal(saved.length,1)
 data.delete('category')
 assert.equal((await postJob({error:''},data)).jobId,'job')
 assert.equal(saved[1].category,'Fencing & Gates')
 assert.equal(classified,1)
})

test('confirmation only returns the saved arrival and success after the RPC succeeds',async()=>{
 const payloads=[], paths=[]
 let fail=true
 const {confirmJob}=compile(await source('../provider-web/src/app/work-actions.ts'),{
  '@shared/categories':{},'next/navigation':{},
  'next/cache':{revalidatePath:path=>paths.push(path)},
  '@/lib/auth':{requireProvider:async()=>({supabase:{rpc:async(name,payload)=>{
   assert.equal(name,'confirm_job')
   payloads.push(payload)
   return {error:fail?{}:null}
  }}})},
  '@/lib/job-input':{validId:()=>true},
  '@shared/flowFeedback':{},'@shared/photos':{},'@shared/dates':dates,'@/lib/offer-input':{},'@/lib/booking-detail':{},
 })
 const data=new FormData()
 const arrival='2099-11-18T21:00:00.000Z'
 for(const [key,value] of Object.entries({bid_id:'bid',job_id:'job',arrival,method:'bank_transfer',message:'Bank details',note:'Arrival note'}))data.set(key,value)
 const failed=await confirmJob({error:''},data)
 assert.match(failed.error,/Could not confirm/)
 assert.equal(failed.arrivalStart,undefined)
 assert.equal(paths.length,0)
 fail=false
 const success=await confirmJob({error:''},data)
 assert.equal(success.arrivalStart,arrival)
 assert.equal(success.success,'Job confirmed.')
 assert.equal(JSON.stringify(payloads[1]),JSON.stringify({
  p_bid:'bid',p_arrival:arrival,p_method:'bank_transfer',p_message:'Bank details',p_note:'Arrival note',
 }))
 assert.deepEqual(paths,['/jobs/job','/activity','/'])
})

test('review submission checks eligibility, redirects after a write and reports failed writes',async()=>{
 let eligible=true,fail=false,writes=0,redirected=''
 const {reviewArrangement}=compile(await source('../provider-web/src/app/activity/actions.ts'),{
  'next/cache':{revalidatePath(){}},
  'next/navigation':{redirect:path=>{redirected=path}},
  '@/lib/auth':{requireProvider:async()=>({user:{id:'requester'},supabase:{from:()=>({
   select:()=>({eq:()=>({eq:async()=>({data:[]})})}),
   insert:()=>({select:async()=>{writes++;return fail?{error:new Error('write failed')}:{data:[{id:'review'}]}}}),
  })}})},
  '@/lib/activity-data':{loadActivityWork:async()=>({providerId:'provider'})},
  '@/lib/activity-policy':{workRole:()=> 'requester',workActions:()=>eligible?['review']:[]},
 })
 const data=new FormData()
 for(const [key,value] of Object.entries({kind:'job',id:'job',rating:'4',comment:'Thanks'}))data.set(key,value)
 eligible=false
 assert.match((await reviewArrangement({error:''},data)).error,/after the arrangement is completed/)
 assert.equal(writes,0)
 eligible=true
 fail=true
 assert.match((await reviewArrangement({error:''},data)).error,/Could not confirm/)
 assert.equal(redirected,'')
 fail=false
 await reviewArrangement({error:''},data)
 assert.equal(redirected,'/jobs/job?reviewed=1#reviews')
 assert.equal(writes,2)
})
