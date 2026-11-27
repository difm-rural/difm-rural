import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as offers from '../shared/offers.ts'
import * as formatting from '../shared/formatting.js'
import * as dates from '../shared/dates.ts'
import * as requested from '../shared/requestedDate.ts'
import * as postingDates from '../shared/postingDates.ts'
import * as mapTarget from '../shared/jobMapTarget.ts'
import * as tokens from '../src/theme/tokens.js'
import {jobNextMove} from '../shared/nextMove.ts'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../src/screens/JobDetailScreen.js',import.meta.url),'utf8')
const code=require('@babel/core').transformSync(source,{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code
const nodes=value=>!value||typeof value!=='object'?[]:Array.isArray(value)?value.flatMap(nodes):[value,...nodes(value.props?.children)]
const text=node=>typeof node==='string'||typeof node==='number'?String(node):!node?'':Array.isArray(node)?node.map(text).join(''):text(node.props?.children)
const baseJob={id:'job',requester_id:'owner',status:'open',title:'Repair the fence',description:'Repair the boundary fence.',category:'Fencing',price_type:'fixed',price:250,location_name:'10 Farm Road, Waitoki',location_area:'Waitoki',latitude:-36.5,longitude:174.5,hide_exact_location:true,materials_type:'provider',access_conditions:['dogs_on_property'],location_note:'Use the second gate',schedule_type:'flexible'}
const question=(id,answer=null)=>({id,asker_id:'p',question:'Question '+id,answer,created_at:'2026-11-22T01:00:00Z'})
const bid=id=>({id,provider_id:id,amount:200,status:'pending',pricing_type:'fixed'})
async function openScreen({review=null,schedule=null,stats={},providerName=null,job={},questions=[question('answered','Yes'),question('first'),question('second')],bids=[bid('p'),bid('q')],userId='owner',params={fromManage:true,focusQuestions:true}}={}) {
 const db={job:{...baseJob,...job},questions:structuredClone(questions),bids:structuredClone(bids)}
 const log={scroll:[],updates:[],accept:[],alerts:[],navigate:[],reads:[],timers:[],calendar:[],late:[],arrival:[],completed:[]}
 let focused=true,dirty=false,tree,slots=[],at=0,effects=[]
 const react={createElement:(type,props,...children)=>{if(type==='ScrollView'&&props?.ref)props.ref.current={scrollTo:value=>log.scroll.push(value)};return {type,props:{...props,children}}},
  useState:init=>{const i=at++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;if(!Object.is(value,slots[i])){slots[i]=value;dirty=true}}]},
  useRef:init=>{const i=at++;return slots[i]??=( {current:init})},
  useEffect:(fn,deps)=>{const i=at++,old=slots[i];if(!old||!deps||deps.some((v,n)=>!Object.is(v,old[n]))){slots[i]=deps??[];effects.push(fn)}}}
 const profiles=[...new Set(['owner','p','q',...bids.map(b=>b.provider_id)])].map(id=>({id,full_name:id==='owner'?'Requester':providerName || `Provider ${id}`}))
 const supabase={auth:{getUser:async()=>({data:{user:{id:userId}}})},from(table){
  let single=false,write=null,filters=[];log.reads.push(table)
  const result=()=>{
   if(write){log.updates.push({table,write,filters});if(table==='job_questions')db.questions=db.questions.map(q=>q.id===filters.find(([key])=>key==='id')?.[1]?{...q,...write}:q);return {data:null,error:null}}
   const data=table==='jobs_public'?db.job:table==='profiles'?{id:userId,primary_role:'provider'}:table==='bids'?db.bids:table==='profiles_public'?(single?profiles[0]:profiles):table==='job_questions'?db.questions:single?null:[]
   return {data,error:null}
  }
  const query=new Proxy({},{get:(_,key)=>key==='then'?(resolve,reject)=>Promise.resolve(result()).then(resolve,reject):(...args)=>{if(key==='single'||key==='maybeSingle')single=true;if(key==='update')write=args[0];if(key==='eq')filters.push(args);return query}})
  return query
 }}
 const component=name=>({__esModule:true,default:name})
 const mocks={react,'react-native':{StyleSheet:{create:v=>v},Platform:{OS:'android'},Alert:{alert:(...v)=>log.alerts.push(v)},...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','Image','KeyboardAvoidingView'].map(v=>[v,v]))},'@react-navigation/native':{useIsFocused:()=>focused},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'../context/UserContext':{useUser:()=>({refreshProfile(){}})},'../theme/tokens':tokens,'../lib/supabase':{supabase},'../lib/roles':{canProvide:()=>true},'../lib/offers':offers,'../../shared/offers':offers,'../../shared/formatting.js':formatting,'../../shared/dates':dates,'../../shared/postingDates':postingDates,'../../shared/requestedDate':requested,'../../shared/jobMapTarget':mapTarget,'../lib/quickPickDates':{localDate:()=>null},'../lib/analytics':{trackEvent(){}},'../lib/listingPerformance':{recordJobProviderView(){}},'../lib/providerStats':{fetchProviderStats:async()=>stats},'../lib/workSchedule':{fetchWorkSchedule:async()=>schedule,saveArrivalWindow:async args=>{log.arrival.push(args);schedule={arrival_start_at:args.start,arrival_end_at:args.end};return {data:schedule,error:null}},sendRunningLate:async args=>{log.late.push(args);return {error:null}},addWorkToPhoneCalendar:async args=>{log.calendar.push(args)},formatArrivalWindow:schedule=>schedule.arrival_start_at},'../lib/location':{stripPlusCode:v=>v,coarseSuburb:v=>v},'../lib/maps':{staticMapUrl:()=>'/map.png',staticMapPolygonUrl:()=>'/polygon.png'},'../lib/jobActions':{markJobComplete:async id=>{log.completed.push(id);db.job={...db.job,status:'completed'};return {error:null}},acceptBid:async(job,offer)=>{log.accept.push({job,offer});db.job={...db.job,status:'accepted'};db.bids=db.bids.map(b=>({...b,status:b.id===offer.id?'accepted':'rejected'}));return {error:null}}},'../lib/watchlist':{},'../lib/reviews':{loadReview:async()=>review},'../../shared/jobReviewStatus':{jobReviewStatus:()=>[]},'../../shared/paymentAcknowledgement':{paymentAcknowledgementAvailable:()=>true},'../lib/lifecycle':{jobStatusLabel:status=>status},'../lib/nextMove':{jobNextMove},'../../shared/jobInvitations':{ACTIVE_JOB_INVITATIONS:[]},'../lib/invites':{respondToJobInvitation:async()=>({})},'../components/JobPrimaryImage':{JobPrivateGallery:'JobPrivateGallery'},'../components/JobArrangementSummary':{JobArrangementSummary:'JobArrangementSummary',JobStatusNotice:'JobStatusNotice'}}
 const module={exports:{}}
 new Function('setTimeout','clearTimeout','require','module','exports',code)((fn,ms)=>{const timer={fn,ms};log.timers.push(timer);return timer},()=>{},name=>{if(name in mocks)return mocks[name];if(name.includes('/components/'))return component(name.split('/').at(-1));throw new Error('Unexpected import '+name)},module,module.exports)
 const render=()=>{at=0;dirty=false;tree=module.exports.default({route:{params:{job:db.job,...params}},navigation:{navigate:(...args)=>log.navigate.push(args),goBack(){}}});const queue=effects;effects=[];queue.forEach(fn=>fn());return nodes(tree)}
 const settle=async()=>{for(let i=0;i<25;i++){if(dirty||!tree)render();await new Promise(resolve=>setImmediate(resolve))}return nodes(tree)}
 const app={db,log,render,settle,all:()=>nodes(tree),text:()=>text(tree),press:async label=>{const n=nodes(tree).find(n=>n.props?.accessibilityLabel===label||n.props?.title===label);assert.ok(n,label);await n.props.onPress();return settle()},type:async value=>{nodes(tree).find(n=>n.props?.accessibilityLabel==='Answer').props.onChangeText(value);return settle()},focus:async value=>{focused=value;dirty=true;return settle()}}
 await settle();return app
}
test('owner open: unanswered Q&A then offers then collapsed details, with one title and no map above actions',async()=>{
 const app=await openScreen();const all=app.all(),body=app.text()
 assert.ok(body.indexOf('Questions & Answers')<body.indexOf('Offer'))
 assert.ok(body.indexOf('Question first')<body.indexOf('2 Offers Received'))
 assert.ok(body.indexOf('Provider q')<body.indexOf('Job details'))
 assert.equal(body.split(baseJob.title).length-1,1)
 assert.ok(!body.includes('Repair the boundary fence.'));assert.ok(!body.includes('Question answered'))
 assert.equal(all.filter(n=>n.props?.accessibilityLabel?.startsWith('Accept offer from')).length,2)
 assert.equal(all.filter(n=>n.props?.accessibilityLabel==='View job location pin on map').length,0)
 assert.deepEqual(app.log.scroll,[{y:0,animated:false}])
 assert.ok(!app.log.reads.includes('jobs'),'location reads still use jobs_public')
})
test('Answer this question opens the existing reply input and posts to that question only',async()=>{
 const app=await openScreen();await app.press('Answer this question: Question second')
 const input=app.all().find(n=>n.props?.accessibilityLabel==='Answer');assert.equal(input.type,'TextInput');assert.equal(input.props.autoFocus,true)
 assert.equal(app.all().filter(n=>n.props?.accessibilityLabel==='Answer').length,1)
 await app.type('  Bring a post driver.  ');await app.press('Post answer')
 assert.equal(app.db.questions.find(q=>q.id==='second').answer,'Bring a post driver.')
 assert.equal(app.db.questions.find(q=>q.id==='first').answer,null)
 assert.equal(app.log.updates.length,1);assert.equal(app.log.updates[0].table,'job_questions');assert.ok(app.log.updates[0].write.answered_at)
 assert.equal(app.log.scroll.length,1,'posting does not steal scroll')
})
test('offer confirmation and acceptance work while unanswered questions remain',async()=>{
 const app=await openScreen();await app.press('Accept offer from Provider q')
 assert.equal(app.log.alerts.at(-1)[0],'Accept Offer');assert.equal(app.log.accept.length,0)
 await app.log.alerts.at(-1)[2].find(button=>button.text==='Accept').onPress();await app.settle()
 assert.equal(app.log.accept[0].offer.id,'q');assert.equal(app.db.job.status,'accepted');assert.equal(app.log.updates.length,0)
 assert.ok(app.db.questions.some(q=>!q.answer))
 assert.ok(app.all().some(n=>n.props?.accessibilityLabel==='Job details'),'accepted requester has compact details')
})
test('details expand/collapse preserves requester exact location, map, materials, timing and answered history',async()=>{
 const app=await openScreen();await app.press('Job details')
 for(const value of [baseJob.description,baseJob.location_name,'Provider to supply materials','Dogs on property','Use the second gate','Flexible','Question answered','Yes'])assert.ok(app.text().includes(value),value)
 assert.ok(app.all().some(n=>n.props?.accessibilityLabel==='View job location pin on map'))
 await app.press('View job location pin on map');assert.equal(app.log.navigate.at(-1)[0],'JobMap');assert.equal(app.log.navigate.at(-1)[1].job.location_name,baseJob.location_name)
 await app.press('Job details');assert.ok(!app.text().includes(baseJob.description))
})
test('question focus waits for loaded questions and rearms on returning, but is absent for ordinary entry',async()=>{
 const app=await openScreen();await app.focus(false);await app.focus(true);assert.equal(app.log.scroll.length,2)
 const normal=await openScreen({params:{}});assert.equal(normal.log.scroll.length,0)
 const empty=await openScreen({questions:[],bids:[]});assert.equal(empty.log.scroll.length,0);assert.ok(empty.text().includes('Job details'));assert.ok(empty.all().some(n=>n.props?.title==='No offers yet'))
 const answered=await openScreen({questions:[question('done','Yes')]});assert.ok(!answered.text().includes('Questions & Answers'));await answered.press('Job details');assert.ok(answered.text().includes('Question done'))
})
test('provider open layout, questions workflow and hidden-location rules are preserved',async()=>{
 const app=await openScreen({userId:'viewer',job:{location_name:null,latitude:-36.5,longitude:174.5,location_exact:false}})
 assert.ok(app.text().indexOf(baseJob.description)<app.text().indexOf('Questions & Answers'))
 assert.ok(app.text().includes('Question answered'));assert.ok(app.text().includes('Question first'))
 assert.ok(!app.all().some(n=>n.props?.accessibilityLabel==='Job details'))
 assert.ok(!app.all().some(n=>n.props?.accessibilityLabel?.startsWith('Answer this question')))
 assert.ok(!app.all().some(n=>n.props?.accessibilityLabel?.startsWith('Accept offer from')))
 assert.ok(!app.all().some(n=>n.props?.accessibilityLabel==='View job location pin on map'))
 await app.press('Ask a question');assert.ok(app.all().some(n=>n.props?.accessibilityLabel==='Your question'))
})
for(const status of ['in_progress','awaiting_completion','completed','cancelled'])test('requester '+status+' keeps the existing expanded layout',async()=>{
 const app=await openScreen({job:{status},bids:[]});assert.ok(app.text().includes(baseJob.description));assert.ok(!app.all().some(n=>n.props?.accessibilityLabel==='Job details'));assert.equal(app.log.scroll.length,0)
})
test('long mobile content keeps the same available reply and offer actions',async()=>{
 const app=await openScreen({job:{title:'Long job title '.repeat(30)},questions:[{...question('long'),question:'Long provider question '.repeat(30)}]})
 assert.equal(app.all().filter(n=>n.props?.accessibilityLabel?.startsWith('Answer this question')).length,1)
 assert.equal(app.all().filter(n=>n.props?.accessibilityLabel?.startsWith('Accept offer from')).length,2)
 const scroll=app.all().find(n=>n.type==='ScrollView'&&n.props.ref);assert.equal(scroll.props.keyboardShouldPersistTaps,'handled')
})


const acceptedOffer={...bid('q'),status:'accepted',amount:375,message:'Agreed work specifics',estimated_duration:'Half a day',payment_method:'cash',payment_sorted_at:null,payment_sorted_by:null}
test('accepted requester shows only the accepted provider, correct agreed amount, reputation and primary chat before payment',async()=>{
 const app=await openScreen({job:{status:'accepted'},bids:[{...bid('p'),status:'rejected'},acceptedOffer],stats:{q:{ratingCount:12,ratingAvg:4.8,jobsDone:18}}})
 assert.ok(app.text().includes('Your provider'));assert.ok(!app.text().includes('Offer Received'));assert.ok(!app.text().includes('Provider p'))
 assert.ok(app.text().includes('Agreed price: $375'));assert.ok(app.text().includes('4.8 (12)'));assert.ok(app.text().includes('18 done'))
 const all=app.all(),chat=all.find(n=>n.props?.title==='Chat with Provider'),payment=all.find(n=>n.type==='JobPaymentHandoff')
 assert.equal(chat.props.variant,'primary');assert.ok(all.indexOf(chat)<all.indexOf(payment));assert.equal(payment.props.bidId,'q');assert.equal(payment.props.providerId,'q');assert.equal(payment.props.canUpdate,true)
 assert.equal(all.filter(n=>n.type==='NextMoveBanner').length,1)
 assert.ok(!app.text().includes('Status: ACCEPTED'));assert.ok(!app.text().includes(baseJob.description));assert.ok(!app.text().includes('Agreed work specifics'))
 await app.press('Chat with Provider');assert.deepEqual(app.log.navigate.at(-1),['Chat',{jobId:'job',jobTitle:baseJob.title,otherUserId:'q',otherUserName:'Provider q'}])
 await app.press('View provider profile');assert.deepEqual(app.log.navigate.at(-1),['ProviderProfile',{providerId:'q'}])
})
test('accepted details preserve exact location, mapped area and supporting fields without a second title/category',async()=>{
 const area=[{latitude:-36.5,longitude:174.5},{latitude:-36.6,longitude:174.5},{latitude:-36.5,longitude:174.6}]
 const app=await openScreen({job:{status:'accepted',area_polygon:area,area_hectares:12},bids:[acceptedOffer]})
 await app.press('Job details');assert.ok(app.text().includes('Agreed work specifics'));assert.ok(app.text().includes(baseJob.location_name));assert.ok(app.text().includes(baseJob.description));assert.ok(app.text().includes('Provider to supply materials'));assert.ok(app.text().includes('Flexible'))
 assert.equal(app.text().split(baseJob.title).length-1,1);assert.equal(app.text().split(baseJob.category).length-1,1)
 await app.press('View job location pin on map');assert.deepEqual(app.log.navigate.at(-1)[1].job.area_polygon,area)
 await app.press('Job details');assert.ok(!app.text().includes(baseJob.location_name))
})
test('arrival status uses existing lifecycle logic independently of payment acknowledgement',async()=>{
 for(const sorted of [null,'2026-11-23T00:00:00Z']){
  const app=await openScreen({job:{status:'accepted'},bids:[{...acceptedOffer,payment_sorted_at:sorted,payment_sorted_by:sorted?'owner':null}],schedule:{arrival_start_at:'2099-01-01T03:00:00Z'}})
  const banner=app.all().find(n=>n.type==='NextMoveBanner');assert.match(banner.props.nextMove.label,/Scheduled|Job confirmed/)
  const payment=app.all().find(n=>n.type==='JobPaymentHandoff');assert.equal(payment.props.sortedAt,sorted);assert.equal(payment.props.sortedBy,sorted?'owner':null)
  const arrangement=app.all().find(n=>n.type==='JobArrangementSummary');assert.equal(arrangement.props.arrival,'2099-01-01T03:00:00Z')
 }
})
test('successful acceptance feedback expires while provider coordination remains visible',async()=>{
 const app=await openScreen();await app.press('Accept offer from Provider q');await app.log.alerts.at(-1)[2].find(b=>b.text==='Accept').onPress();await app.settle()
 assert.ok(app.all().some(n=>n.type==='JobStatusNotice'&&text(n)==='Offer accepted.'))
 assert.equal(app.log.timers.at(-1).ms,4000);app.log.timers.at(-1).fn();await app.settle()
 assert.ok(!app.all().some(n=>n.type==='JobStatusNotice'&&text(n)==='Offer accepted.'));assert.ok(app.text().includes('Your provider'))
})
test('accepted requester long names and prices can wrap vertically without a fixed line limit',async()=>{
 const app=await openScreen({job:{status:'accepted'},bids:[{...acceptedOffer,amount:1234567}],providerName:'Long provider name '.repeat(20)})
 const name=app.all().find(n=>n.type==='Text'&&text(n)==='Long provider name '.repeat(20));assert.equal(name.props.numberOfLines,undefined)
 const price=app.all().find(n=>n.type==='Text'&&text(n).startsWith('Agreed price:'));assert.equal(price.props.numberOfLines,undefined)
})

test('accepted provider keeps the existing provider-specific coordination view',async()=>{
 const app=await openScreen({job:{status:'accepted'},bids:[acceptedOffer],userId:'q'})
 assert.ok(!app.text().includes('Your provider'));assert.ok(app.all().some(n=>n.props?.accessibilityLabel==='Job details'))
 assert.ok(app.all().some(n=>n.type==='ConfirmJobSheet'));assert.ok(!app.log.timers.length)
})

test('provider summary badges wrap within narrow-screen padding without truncating status',async()=>{
 const app=await openScreen({job:{status:'cancelled',category:'Animals & Farm Sitting'},bids:[acceptedOffer],userId:'q'})
 const all=app.all(),category=all.find(n=>n.type==='Text'&&text(n)==='Category: Animals & Farm Sitting')
 const header=all.find(n=>n.type==='View'&&nodes(n.props.children).includes(category)&&n.props.style?.flexWrap==='wrap')
 assert.ok(header,'provider-only badge row wraps')
 const flatten=value=>Object.assign({},...([value].flat(Infinity).filter(Boolean)))
 const badge=nodes(header).find(n=>n.type==='View'&&flatten(n.props.style).maxWidth==='100%')
 const status=nodes(badge).find(n=>n.type==='Text')
 assert.equal(text(status),'cancelled')
 assert.equal(status.props.numberOfLines,undefined);assert.equal(status.props.ellipsizeMode,undefined)
 assert.equal(header.props.style.alignItems,'flex-start')
 for(const item of [category,badge]){
  const style=flatten(item.props.style);assert.equal(style.maxWidth,'100%');assert.equal(style.minWidth,0);assert.equal(style.flexShrink,1)
 }
 const card=all.find(n=>n.type==='View'&&n.props.style?.borderWidth===1.5&&nodes(n).includes(header))
 const scroll=all.find(n=>n.type==='ScrollView'&&nodes(n).includes(card))
 assert.equal(scroll.props.style.padding,16);assert.equal(card.props.style.padding,16)

})

test('provider Release 2 unconfirmed: primary confirmation, compact summary, details and existing confirm sheet',async()=>{
 const app=await openScreen({job:{status:'accepted'},bids:[acceptedOffer],userId:'q'})
 assert.ok(app.text().includes('Confirm your arrival time'));assert.ok(!app.text().includes('Your offer was accepted'))
 assert.equal(app.text().split(baseJob.title).length-1,1);assert.ok(!app.text().includes(baseJob.description))
 const confirm=app.all().find(n=>n.props?.title==='Confirm job');assert.equal(confirm.props.variant,undefined)
 await app.press('Confirm the job');const sheet=app.all().find(n=>n.type==='ConfirmJobSheet');assert.equal(sheet.props.visible,true);assert.equal(sheet.props.bidId,'q');assert.equal(sheet.props.amount,375)
 await sheet.props.onClose();await app.settle();assert.equal(app.all().find(n=>n.type==='ConfirmJobSheet').props.visible,false)
 await app.press('Job details');assert.ok(app.text().includes(baseJob.description));assert.ok(app.text().includes(baseJob.location_name));assert.ok(app.text().includes('Provider to supply materials'))
 await app.press('View job location pin on map');assert.equal(app.log.navigate.at(-1)[0],'JobMap');await app.press('Job details');assert.ok(!app.text().includes(baseJob.description))
})
test('provider scheduled: one arrival summary, ordered actions and scheduling controls',async()=>{
 const app=await openScreen({job:{status:'accepted'},bids:[acceptedOffer],userId:'q',schedule:{arrival_start_at:'2099-01-01T03:00:00Z',arrival_end_at:'2099-01-01T04:00:00Z'}})
 assert.ok(app.text().includes('Scheduled'));assert.equal(app.text().split('2099-01-01T03:00:00Z').length-1,1)
 const buttons=app.all().filter(n=>n.type==='Button').map(n=>n.props.title)
 // Before the arrival day: Chat is the main action, Mark as completed a full outlined
 // button, then Directions and More side by side.
 assert.deepEqual(buttons.slice(0,4),['Chat with Requester','Mark as completed','Directions','More'])
 await app.press('Chat with Requester');assert.equal(app.log.navigate.at(-1)[0],'Chat')
 await app.press('Directions');assert.equal(app.log.navigate.at(-1)[0],'JobMap')
 await app.press('More actions')
 await app.press('Add to phone calendar');assert.equal(app.log.calendar.length,1)
 await app.press('Change arrival time');const sheet=app.all().find(n=>n.type==='ArrivalWindowModal');assert.equal(sheet.props.visible,true)
 await sheet.props.onSave('2099-01-02T03:00:00Z','2099-01-02T04:00:00Z');await app.settle();assert.equal(app.log.arrival[0].jobId,'job');assert.ok(app.text().includes('2099-01-02T03:00:00Z'))
 // "Running late" was removed (delays go in chat).
 assert.ok(!app.all().some(n=>n.type==='Button'&&/running late/i.test(n.props.title||'')))
})
test('completion cancellation writes nothing; completion remains available before future arrival, then prioritises review and payment',async()=>{
 const app=await openScreen({job:{status:'accepted'},bids:[acceptedOffer],userId:'q',schedule:{arrival_start_at:'2099-01-01T03:00:00Z'}})
 // Before the arrival day, Mark as completed is still available under More.
 await app.press('More actions')
 await app.press('Mark job as completed');let sheet=app.all().find(n=>n.type==='MarkCompleteSheet');assert.equal(sheet.props.visible,true)
 await sheet.props.onClose();await app.settle();assert.deepEqual(app.log.completed,[])
 await app.press('Job details');await app.press('Mark job as completed');sheet=app.all().find(n=>n.type==='MarkCompleteSheet');await sheet.props.onConfirm();await app.settle()
 assert.deepEqual(app.log.completed,['job']);assert.ok(app.text().includes('Work completed'));assert.ok(!app.text().includes('Your offer was accepted'));assert.ok(!app.text().includes(baseJob.description))
 assert.equal(app.all().find(n=>n.type==='Button').props.title,'Review requester');await app.press('Review requester');assert.equal(app.all().find(n=>n.type==='ReviewModal').props.visible,true)
 const payment=app.all().find(n=>n.type==='JobPaymentHandoff');assert.equal(payment.props.bidId,'q');assert.equal(payment.props.canUpdate,true);assert.equal(payment.props.canEditMethod,false)
})
test('completed provider preserves reviewed state, payment attribution and secondary navigation',async()=>{
 const app=await openScreen({job:{status:'completed'},bids:[{...acceptedOffer,payment_sorted_at:'2026-11-23',payment_sorted_by:'q'}],userId:'q',review:{rating:5,comment:'Great'}})
 const review=app.all().find(n=>n.props?.accessibilityLabel==='Edit requester review');assert.equal(review.props.variant,'secondary')
 const payment=app.all().find(n=>n.type==='JobPaymentHandoff');assert.equal(payment.props.sortedBy,'q');assert.equal(payment.props.sortedAt,'2026-11-23')
 // Finished work needs no directions.
 assert.equal(app.all().find(n=>n.props?.title==='Navigate to job'),undefined)
 assert.ok(app.text().includes('Work completed'))
})

test('completion sheet uses the requested wording and full-width stacked buttons',()=>{
 const src=readFileSync(new URL('../src/components/MarkCompleteSheet.js',import.meta.url),'utf8')
 const compiled=require('@babel/core').transformSync(src,{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code
 const module={exports:{}};let cancelled=0,completed=0
 const mocks={react:{createElement:(type,props,...children)=>({type,props:{...props,children}})},'react-native':{Modal:'Modal',View:'View',Text:'Text',StyleSheet:{create:v=>v}},'./Button':{__esModule:true,default:'Button'},'../theme/tokens':tokens}
 new Function('require','module','exports',compiled)(name=>mocks[name],module,module.exports)
 const tree=module.exports.default({visible:true,busy:false,onClose:()=>cancelled++,onConfirm:()=>completed++})
 assert.ok(text(tree).includes('Mark job as complete?'));assert.ok(text(tree).includes("Confirm that you've finished the work. The requester will be notified and can leave a review."))
 const buttons=nodes(tree).filter(n=>n.type==='Button');assert.deepEqual(buttons.map(n=>n.props.title),['Not yet','Complete job'])
 assert.ok(buttons.every(n=>n.props.style.alignSelf==='stretch'))
 const row=nodes(tree).find(n=>n.type==='View'&&nodes(n).includes(buttons[0])&&n.props.style?.gap===12&&n.props.style?.backgroundColor===undefined)
 assert.notEqual(row.props.style.flexDirection,'row');buttons[0].props.onPress();assert.equal(cancelled,1);assert.equal(completed,0);buttons[1].props.onPress();assert.equal(completed,1)
})

for(const status of ['open','accepted','completed','cancelled'])test('provider '+status+' uses one full multiline job heading',async()=>{
 const title='Repair fencing along the lower paddock and stream boundary '.repeat(3)
 const app=await openScreen({job:{status,title},bids:status==='open'?[]:[acceptedOffer],userId:'q'})
 assert.equal(app.text().split(title).length-1,1)
 const heading=app.all().find(n=>n.type==='Text'&&n.props.accessibilityRole==='header');assert.equal(text(heading),title);assert.equal(heading.props.numberOfLines,undefined)
})

test('accepted, not yet confirmed: Confirm is the only main action; no completion or payment buttons yet',async()=>{
 const app=await openScreen({job:{status:'accepted'},bids:[acceptedOffer],userId:'q'})
 const titles=app.all().filter(n=>n.type==='Button').map(n=>n.props.title)
 assert.ok(titles.includes('Confirm job'));assert.ok(titles.includes('Chat'));assert.ok(titles.includes('Directions'))
 for(const gone of ['Mark as completed','View requester profile','Navigate to job'])assert.ok(!titles.includes(gone),gone)
 assert.equal(app.all().find(n=>n.type==='JobPaymentHandoff'),undefined)
 assert.ok(app.text().includes('when you confirm the job'))
})

test('on the arrival day, Mark as completed becomes the main action',async()=>{
 const app=await openScreen({job:{status:'accepted'},bids:[acceptedOffer],userId:'q',schedule:{arrival_start_at:'2020-01-01T03:00:00Z'}})
 const buttons=app.all().filter(n=>n.type==='Button')
 assert.equal(buttons[0].props.title,'Mark as completed');assert.notEqual(buttons[0].props.variant,'secondary')
 assert.deepEqual(buttons.slice(1,4).map(b=>b.props.title),['Chat','Directions','More'])
})
