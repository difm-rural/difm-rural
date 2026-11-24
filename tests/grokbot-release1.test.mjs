import {agreedJobDetails} from '../shared/agreedJobDetails.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as arrivalTime from '../shared/arrivalTime.ts'
import * as formatting from '../shared/formatting.js'
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
  react:{useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]},useEffect(){},useRef:()=>({current:null}),useActionState:()=>[state,()=>{},false]},
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
 assert.equal(field(render(),'item_label').props.value,'Fixed price')
 assert.equal(field(render(),'item_label').props.placeholder,'e.g. Labour')
 assert.equal(hasGuidance(render()),false)
 change('item_amount','25')
 change('pricing_type','hourly')
 assert.equal(field(render(),'item_label').props.value,'Labour')
 assert.equal(field(render(),'item_amount').props.value,'25')
 assert.equal(hasGuidance(render()),true)
 change('pricing_type','fixed')
 assert.equal(field(render(),'item_label').props.value,'Fixed price')
 change('pricing_type','hourly')
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
 const saved={id:'offer',line_items:[{label:'Fixed price',amount:90}],available_from:'2026-03-07',pricing_type:'fixed'}
 const editing=render(saved)
 assert.equal(field(editing,'item_label').props.value,'Fixed price')
 field(editing,'pricing_type').props.onChange({target:{value:'hourly'}})
 assert.equal(field(render(saved),'item_label').props.value,'Fixed price')
 assert.equal(field(editing,'item_amount').props.value,'90')
 assert.equal(field(editing,'available_from').props.value,'07/03/2026')
})

test('shared offer defaults distinguish automatic text from manual and saved labels',()=>{
 const [first]=offers.initialOfferLines()
 const priced={...first,amount:'120.50'}
 assert.deepEqual(offers.updateOfferPricingDescription([priced],'hourly'),[{...priced,label:'Labour'}])
 const manual=offers.editOfferPriceDescription(priced,'Labour')
 const cleared=offers.editOfferPriceDescription(priced,'')
 const extra={label:'Travel',amount:'15'}
 const existing=offers.initialOfferLines({line_items:[{label:'Labour',amount:90}]})
 assert.deepEqual(offers.updateOfferPricingDescription([manual,cleared,extra,...existing],'fixed'),[manual,cleared,extra,...existing])
 assert.deepEqual(offers.updateOfferPricingDescription(offers.initialOfferLines({amount:90}),'fixed'),[{label:'',amount:'90'}])
 assert.equal(offers.updateOfferPricingDescription([first],'quote')[0].label,'')
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
  '@/components/date-input':{DateInput:props=>jsx.jsx('input',{...props,type:'date'})},
 '@/components/action-form':{useSubmitGuard:()=>()=>{}},
  '@shared/formatting':{formatWorkDateTime:()=> '7 March, 11:35 am'},
  '@shared/arrivalTime':{...arrivalTime,arrivalInputValue:date=>arrivalTime.arrivalInputValue(new Date(+date))},'@shared/offers':offers,
  '@shared/postingDates':{nzToday:()=> '2099-03-01'},
  '@shared/requestedDate':{arrivalDayChoices:()=>({preselect,requestedLabel:'7 March',chips:[]}),arrivalDayNote:()=>({})},
  '../../work-actions':{confirmJob(){},changeJobArrival(){},setJobPaymentMethod(){}},
  'lucide-react':{LoaderCircle:()=>null},
 })
 const props={bidId:'bid',jobId:'job',jobTitle:'Fixture',requesterFirst:'Sam',schedule:{},availableFrom:null,amount:25,pricingType:'fixed'}
 const fields=tree=>{
  const fieldset=tree.find(node=>typeof node.type==='function'&&node.type.name==='ArrivalFields')
  return nodes(fieldset.type(fieldset.props))
 }
 const fresh=nodes(ConfirmJob({...props,arrivalStart:null}))
 const freshFields=fields(fresh)
 const date=freshFields.find(node=>typeof node.type==='function'&&node.type.name==='DateInput')
 const time=freshFields.find(node=>node.type==='input'&&node.props.type==='time')
 assert.equal(date.props.value,'2099-03-07')
 assert.equal(time.props.value,'')
 assert.equal(time.props.required,true)
 assert.ok(fresh.some(node=>node.type==='button'&&[node.props.children].flat().includes('Confirm job')&&node.props.disabled))
 const saved=arrivalTime.parseArrivalInput('2099-03-07T11:35').toISOString()
 preselect=null
 state={error:'Could not confirm the job.'}
 const failed=nodes(ConfirmJob({...props,arrivalStart:null}))
 assert.equal(fields(failed).find(node=>typeof node.type==='function'&&node.type.name==='DateInput').props.value,'')
 assert.ok(failed.some(node=>node.props.role==='alert'&&node.props.children===state.error))
 assert.ok(!failed.some(node=>node.props.role==='status'&&node.props.children))
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
 let value
 const {StarRatingInput}=compile(await source('../provider-web/src/components/star-rating-input.tsx'),{react:{
  useState:initial=>[value??=initial,next=>{value=next}],
 }})
 const changes=[]
 const picker=nodes(StarRatingInput({rating:3,onRating:value=>changes.push(value)}))
 const labels=picker.filter(node=>node.type==='label')
 assert.ok(picker.some(node=>node.props.role==='status'&&node.props.children==='3 of 5 stars'))
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
 nodes(StarRatingInput({})).find(node=>node.props.value===4).props.onChange()
 assert.ok(nodes(StarRatingInput({})).some(node=>node.props.role==='status'&&node.props.children==='4 of 5 stars'))
 const css=await source('../provider-web/src/app/globals.css')
 assert.match(css,/\.star-input input \{[^}]*clip-path: inset\(50%\)/)
 assert.match(css,/\.star-input input:focus-visible \+ span \{[^}]*outline: 3px/)
})

test('posting keeps a validated explicit category and only suggests when it is absent',async()=>{
 const categories=['Fencing & Gates','Property & House Sitting','General Rural Help']
 const saved=[],redirects=[]
 let classified=0,collision=false,verifiedOwnedDraft=false
 const {postJob}=compile(await source('../provider-web/src/app/work-actions.ts'),{
  '@shared/categories':{CATEGORIES:categories},
  'next/navigation':{redirect(path){redirects.push(path);throw new Error('REDIRECT:'+path)}},'next/cache':{revalidatePath(){}},
  '@/lib/auth':{requireProvider:async()=>({user:{id:'requester'},supabase:{
   from:()=>({
    select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:verifiedOwnedDraft?{id:'job'}:null})})})}),
    insert:async payload=>{
     if(collision){verifiedOwnedDraft=true;return {error:{code:'23505'}}}
     saved.push(payload);return {}
    },
   }),
   functions:{invoke:async()=>{classified++;return {data:{category:'Fencing & Gates'}}}},
  }})},
  '@/lib/job-input':{validId:value=>value==='job',jobInput:()=>({ok:true,value:{title:'Repair a gate',description:'Replace two hinges'}})},
  '@shared/flowFeedback':{},'@shared/photos':{},'@shared/categoryArtwork':{categoryArtwork:()=>'/images/general.png'},'@shared/dates':dates,'@/lib/offer-input':{},'@/lib/booking-detail':{},
 })
 const data=new FormData()
 data.set('job_id','job')
 data.set('category','Property & House Sitting')
 await assert.rejects(postJob({error:''},data),/REDIRECT:\/jobs\/job\?posted=1/)
 assert.equal(saved[0].category,'Property & House Sitting')
 assert.equal(classified,0)
 data.set('category','Invented category')
 assert.match((await postJob({error:''},data)).error,/existing job category/)
 assert.equal(saved.length,1)
 data.delete('category')
 await assert.rejects(postJob({error:''},data),/REDIRECT:\/jobs\/job\?posted=1/)
 assert.equal(saved[1].category,'Fencing & Gates')
 assert.equal(classified,1)
 collision=true
 data.set('category','Fencing & Gates')
 await assert.rejects(postJob({error:''},data),/REDIRECT:\/jobs\/job\?posted=1/)
 assert.equal(saved.length,2)
 assert.equal(redirects.length,3)
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
  '@shared/flowFeedback':{},'@shared/photos':{},'@shared/categoryArtwork':{categoryArtwork:()=>'/images/general.png'},'@shared/dates':dates,'@/lib/offer-input':{},'@/lib/booking-detail':{},
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

test('accepting an offer keeps the existing RPC and navigates to feedback only on success',async()=>{
 let rpcError={message:'Offer no longer available'}, redirectPath, owner='requester'
 const calls=[], revalidated=[]
 const {acceptOffer}=compile(await source('../provider-web/src/app/work-actions.ts'),{
  '@shared/categories':{},
  'next/navigation':{redirect(path){redirectPath=path;throw Error('redirect')}},
  'next/cache':{revalidatePath:path=>revalidated.push(path)},
  '@/lib/auth':{requireProvider:async()=>({user:{id:'requester'},supabase:{
   from:table=>({select:()=>({eq:()=>({single:async()=>({data:table==='bids'?{id:'offer',job_id:'job'}:{requester_id:owner,status:'open'}})})})}),
   rpc:async(name,payload)=>{calls.push([name,payload.p_offer_id]);return {error:rpcError}},
  }})},
  '@/lib/job-input':{},'@shared/flowFeedback':{},'@shared/photos':{},'@shared/categoryArtwork':{categoryArtwork:()=>'/images/general.png'},'@shared/dates':dates,'@/lib/offer-input':{},'@/lib/booking-detail':{},
 })
 const data=new FormData()
 data.set('offer_id','offer')
 assert.match((await acceptOffer({error:''},data)).error,/Could not confirm/)
 assert.equal(redirectPath,undefined)
 assert.deepEqual(revalidated,[])
 owner='other'
 assert.match((await acceptOffer({error:''},data)).error,/no longer accepting/)
 assert.equal(calls.length,1)
 owner='requester'
 rpcError=null
 await assert.rejects(acceptOffer({error:''},data),/redirect/)
 assert.equal(redirectPath,'/jobs/job?accepted=1')
 assert.deepEqual(revalidated,['/','/jobs/job'])
 assert.deepEqual(calls,[['accept_job_offer','offer'],['accept_job_offer','offer']])
})

test('posted job displays separate category and location labels and verified acceptance feedback',async()=>{
 const job={id:'job',requester_id:'requester',title:'Repair a drain',category:'Water & Drainage',location_area:'Waitoki',status:'accepted',schedule_type:'flexible'}
 const bid={id:'offer',status:'accepted',provider_id:'provider',available_from:'2026-11-20'}
 const rows={jobs_public:job,bids:[bid]}
 let userId='requester'
 const {default:JobPage}=compile(await source('../provider-web/src/app/jobs/[id]/page.tsx'),new Proxy({
  '@shared/jobMapTarget':{jobMapTarget:()=>null},'@shared/agreedJobDetails':{agreedJobDetails}, '@shared/formatting':formatting,
  '@shared/nextMove':{jobNextMove:()=>null},'@shared/offers':offers,
  '@shared/paymentAcknowledgement':{paymentAcknowledgementActor:()=>null,paymentAcknowledgementAvailable:()=>true,agreedPaymentMethodLabels:{}},
  '@/components/navigation-link':{default:'a'},'@/lib/work':{statusLabel:x=>x,jobBoardStatusLabel:x=>x},
  '@/lib/job-input':{SCHEDULES:{},jobOwnerActions:()=>({})},
  '@/lib/activity-policy':{workRole:()=> 'requester',workActions:()=>[]},
  '@/lib/messaging-data':{loadConversation:async()=>null},
  '@/lib/notification-read':{markNotificationsReadFor:async()=>{}},
  '@/lib/auth':{requireProvider:async()=>({user:{id:userId},supabase:{
   from(table){
    return {select(){return this},eq(){return this},order(){return this},in(){return this},
     async maybeSingle(){return {data:rows[table]??null}},
     then(resolve){return Promise.resolve({data:rows[table]??[]}).then(resolve)},
    }
   },
  }})},
 },{has:()=>true,get:(target,name)=>target[name]??{}}))
 const render=()=>JobPage({params:{id:'job'},searchParams:{accepted:'1'}}).then(nodes)
 const tree=await render()
 function content(node){return [node.props.children].flat(Infinity).filter(value=>typeof value==='string').join('')}
 for(const label of ['Category: Water & Drainage','Location: Waitoki','Available from: Fri 20 Nov 2026','Offer accepted.'])
  assert.ok(tree.some(node=>node.type==='p'&&content(node)===label),label)
 userId='provider'
 assert.ok(!(await render()).some(node=>node.props.role==='status'&&content(node)==='Offer accepted.'))
 userId='requester'
 job.status='open'
 assert.ok(!(await render()).some(node=>node.props.role==='status'&&content(node)==='Offer accepted.'))
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


test('agreed arrangements use the latest Auckland arrival and omit missing estimates',()=>{
 assert.deepEqual(agreedJobDetails('2026-11-19T22:00:00Z',' 2 hours '),{arrival:'Fri 20 Nov 2026, 11:00 am',duration:'2 hours'})
 assert.deepEqual(agreedJobDetails('2026-11-20T00:00:00Z',''),{arrival:'Fri 20 Nov 2026, 1:00 pm',duration:null})
 assert.deepEqual(agreedJobDetails(null,null),{arrival:null,duration:null})
})

test('offer submission navigates to a persistent job banner only after database success',async()=>{
 let writeError=true,existing=false,destination
 let writes=0
 const {sendOffer}=compile(await source('../provider-web/src/app/work-actions.ts'),{
  '@shared/categories':{},'@shared/flowFeedback':{},'@shared/photos':{},'@shared/dates':dates,
  'next/navigation':{redirect(path){destination=path;throw Error('redirect')}},'next/cache':{revalidatePath(){}},
  '@/lib/job-input':{},'@/lib/booking-detail':{},'@/lib/offer-input':{offerInput:()=>({ok:true,value:{amount:50}})},
  '@/lib/auth':{requireProvider:async()=>({user:{id:'provider'},supabase:{
   from:table=>table==='jobs_public'?{select:()=>({eq:()=>({single:async()=>({data:{requester_id:'owner',status:'open'}})})})}:{
    select:()=>({eq:()=>({eq:()=>({in:async()=>({data:existing?[{id:'offer'}]:[]})})})}),
    insert:async()=>{writes++;return {error:writeError?{}:null}},
   },
  }})},
 })
 const data=new FormData()
 data.set('job_id','job')
 assert.match((await sendOffer({error:''},data)).error,/details are kept/)
 assert.equal(destination,undefined)
 existing=true
 assert.match((await sendOffer({error:''},data)).error,/already have an offer/)
 assert.equal(writes,1)
 existing=false;writeError=false
 await assert.rejects(sendOffer({error:''},data),/redirect/)
 assert.equal(destination,'/jobs/job?offered=1')
})
