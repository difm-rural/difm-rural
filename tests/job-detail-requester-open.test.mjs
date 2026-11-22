import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as offers from '../shared/offers.ts'
import * as formatting from '../shared/formatting.js'
import * as dates from '../shared/dates.ts'
import * as requested from '../shared/requestedDate.ts'
import * as mapTarget from '../shared/jobMapTarget.ts'
import * as tokens from '../src/theme/tokens.js'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../src/screens/JobDetailScreen.js',import.meta.url),'utf8')
const code=require('@babel/core').transformSync(source,{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code
const nodes=value=>!value||typeof value!=='object'?[]:Array.isArray(value)?value.flatMap(nodes):[value,...nodes(value.props?.children)]
const text=node=>typeof node==='string'||typeof node==='number'?String(node):!node?'':Array.isArray(node)?node.map(text).join(''):text(node.props?.children)
const baseJob={id:'job',requester_id:'owner',status:'open',title:'Repair the fence',description:'Repair the boundary fence.',category:'Fencing',price_type:'fixed',price:250,location_name:'10 Farm Road, Waitoki',location_area:'Waitoki',latitude:-36.5,longitude:174.5,hide_exact_location:true,materials_type:'provider',access_conditions:['dogs_on_property'],location_note:'Use the second gate',schedule_type:'flexible'}
const question=(id,answer=null)=>({id,asker_id:'p',question:'Question '+id,answer,created_at:'2026-11-22T01:00:00Z'})
const bid=id=>({id,provider_id:id,amount:200,status:'pending',pricing_type:'fixed'})
async function openScreen({job={},questions=[question('answered','Yes'),question('first'),question('second')],bids=[bid('p'),bid('q')],userId='owner',params={fromManage:true,focusQuestions:true}}={}) {
 const db={job:{...baseJob,...job},questions:structuredClone(questions),bids:structuredClone(bids)}
 const log={scroll:[],updates:[],accept:[],alerts:[],navigate:[],reads:[]}
 let focused=true,dirty=false,tree,slots=[],at=0,effects=[]
 const react={createElement:(type,props,...children)=>{if(type==='ScrollView'&&props?.ref)props.ref.current={scrollTo:value=>log.scroll.push(value)};return {type,props:{...props,children}}},
  useState:init=>{const i=at++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;if(!Object.is(value,slots[i])){slots[i]=value;dirty=true}}]},
  useRef:init=>{const i=at++;return slots[i]??=( {current:init})},
  useEffect:(fn,deps)=>{const i=at++,old=slots[i];if(!old||!deps||deps.some((v,n)=>!Object.is(v,old[n]))){slots[i]=deps??[];effects.push(fn)}}}
 const profiles=[...new Set(['owner','p','q',...bids.map(b=>b.provider_id)])].map(id=>({id,full_name:id==='owner'?'Requester':`Provider ${id}`}))
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
 const mocks={react,'react-native':{StyleSheet:{create:v=>v},Platform:{OS:'android'},Alert:{alert:(...v)=>log.alerts.push(v)},...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','Image','KeyboardAvoidingView'].map(v=>[v,v]))},'@react-navigation/native':{useIsFocused:()=>focused},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'../context/UserContext':{useUser:()=>({refreshProfile(){}})},'../theme/tokens':tokens,'../lib/supabase':{supabase},'../lib/roles':{canProvide:()=>true},'../lib/offers':offers,'../../shared/offers':offers,'../../shared/formatting.js':formatting,'../../shared/dates':dates,'../../shared/requestedDate':requested,'../../shared/jobMapTarget':mapTarget,'../lib/quickPickDates':{localDate:()=>null},'../lib/analytics':{trackEvent(){}},'../lib/listingPerformance':{recordJobProviderView(){}},'../lib/providerStats':{fetchProviderStats:async()=>({})},'../lib/workSchedule':{fetchWorkSchedule:async()=>null},'../lib/location':{stripPlusCode:v=>v,coarseSuburb:v=>v},'../lib/maps':{staticMapUrl:()=>'/map.png',staticMapPolygonUrl:()=>'/polygon.png'},'../lib/jobActions':{acceptBid:async(job,offer)=>{log.accept.push({job,offer});db.job={...db.job,status:'accepted'};db.bids=db.bids.map(b=>({...b,status:b.id===offer.id?'accepted':'rejected'}));return {error:null}}},'../lib/watchlist':{},'../lib/reviews':{loadReview:async()=>null},'../../shared/jobReviewStatus':{jobReviewStatus:()=>[]},'../../shared/paymentAcknowledgement':{paymentAcknowledgementAvailable:()=>true},'../lib/lifecycle':{jobStatusLabel:status=>status},'../lib/nextMove':{jobNextMove:()=>null},'../../shared/jobInvitations':{ACTIVE_JOB_INVITATIONS:[]},'../lib/invites':{respondToJobInvitation:async()=>({})},'../components/JobPrimaryImage':{JobPrivateGallery:'JobPrivateGallery'},'../components/JobArrangementSummary':{JobArrangementSummary:'JobArrangementSummary',JobStatusNotice:'JobStatusNotice'}}
 const module={exports:{}}
 new Function('require','module','exports',code)(name=>{if(name in mocks)return mocks[name];if(name.includes('/components/'))return component(name.split('/').at(-1));throw new Error('Unexpected import '+name)},module,module.exports)
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
 assert.ok(!app.all().some(n=>n.props?.accessibilityLabel==='Job details'),'accepted requester retains existing layout')
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
for(const status of ['accepted','in_progress','awaiting_completion','completed','cancelled'])test('requester '+status+' keeps the existing expanded layout',async()=>{
 const app=await openScreen({job:{status},bids:[]});assert.ok(app.text().includes(baseJob.description));assert.ok(!app.all().some(n=>n.props?.accessibilityLabel==='Job details'));assert.equal(app.log.scroll.length,0)
})
test('long mobile content keeps the same available reply and offer actions',async()=>{
 const app=await openScreen({job:{title:'Long job title '.repeat(30)},questions:[{...question('long'),question:'Long provider question '.repeat(30)}]})
 assert.equal(app.all().filter(n=>n.props?.accessibilityLabel?.startsWith('Answer this question')).length,1)
 assert.equal(app.all().filter(n=>n.props?.accessibilityLabel?.startsWith('Accept offer from')).length,2)
 const scroll=app.all().find(n=>n.type==='ScrollView'&&n.props.ref);assert.equal(scroll.props.keyboardShouldPersistTaps,'handled')
})

