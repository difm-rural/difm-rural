import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as cancelLogic from '../shared/postJobCancel.ts'
import {repeatJobToJobData} from '../src/lib/repeatJob.js'

const {jobDraftChanged,cancelPrompt,wizardExit,wizardIsEdit}=cancelLogic
const require=createRequire(import.meta.url)
const {StackRouter,CommonActions,StackActions}=require('@react-navigation/routers')
const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8')
const compile=path=>require('@babel/core').transformSync(read(path),{configFile:false,babelrc:false,
 presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
function load(path,modules){
 const module={exports:{}}
 vm.runInNewContext(compile(path),{exports:module.exports,require:name=>{if(name in modules)return modules[name];throw Error(name)}})
 return module.exports
}
const STEPS=['PostJobStep2Location','PostJobStep3Details','PostJobStep4Budget','PostJobStep5Review']

// A stack on the real router, with the calls the wizard makes.
function stack(names,initial){
 const router=StackRouter({}),options={routeNames:names,routeParamList:{},routeGetIdList:{}}
 let state=router.getInitialState(options)
 const run=action=>{
  const next=router.getStateForAction(state,action,options)
  if(!next)return false
  state=next.routeNames?next:router.getRehydratedState(next,options)
  return true
 }
 if(initial)run(CommonActions.reset({index:0,routes:[{name:initial}]}))
 return {run,go:(name,params)=>run(CommonActions.navigate(name,params)),names:()=>Array.from(state.routes,route=>route.name),
  getState:()=>state,pop:n=>run(StackActions.pop(n)),reset:value=>run(CommonActions.reset(value))}
}
const ENTRIES={
 'new job from the board':{names:['JobsBoard','PostJob',...STEPS,'AreaTracer'],first:'PostJob',back:['JobsBoard']},
 'edit from a job':{names:['ActivityMain','ManageTask','PostJob',...STEPS,'AreaTracer'],under:'ManageTask',first:'PostJob',params:{mode:'edit',job:{id:'j'}},back:['ActivityMain','ManageTask']},
 'repeat a job':{names:['ActivityMain','ManageTask','PostJob',...STEPS],under:'ManageTask',first:'PostJob',params:{mode:'repeat',repeatJob:{id:'j'}},back:['ActivityMain','ManageTask']},
 'provider invitation':{names:['JobsBoard','PostJob',...STEPS],first:'PostJob',params:{inviteProviderId:'p',inviteProviderName:'Ana'},back:['JobsBoard']},
 'guest':{names:['Landing','GuestPostJob',...STEPS],first:'GuestPostJob',back:['Landing']},
 'invitation into an unvisited Jobs tab':{names:['JobsBoard','PostJob',...STEPS],initial:'PostJob',first:'PostJob',back:['JobsBoard'],parentBack:true},
}
function open(entry,step){
 const nav=stack(entry.names,entry.initial)
 if(entry.under)nav.go(entry.under)
 if(!entry.initial)nav.go(entry.first,entry.params)
 for(const name of STEPS.slice(0,step-1))nav.go(name,entry.params)
 return nav
}

// The real hook, with just enough React and React Native around it.
function mount({nav,step,changed=true,busy=false,extraChanges=false,stored=null,storageFails=false}){
 const log={alerts:[],reset:0,parentBack:0,removed:[],options:{},keyboard:0}
 const listeners=[]
 const navigation={...nav,setOptions:value=>Object.assign(log.options,value),
  getParent:()=>({canGoBack:()=>true,goBack:()=>log.parentBack++})}
 const {usePostJobCancel}=load('screens/postjob/usePostJobCancel.js',{
  react:{useRef:current=>({current}),useCallback:fn=>fn,useEffect:fn=>fn()},
  'react-native':{Alert:{alert:(...args)=>log.alerts.push(args)},Keyboard:{dismiss:()=>log.keyboard++},
   BackHandler:{addEventListener:(_name,fn)=>{listeners.push(fn);return {remove(){}}}}},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{
   getItem:async()=>{if(storageFails)throw Error('storage');return stored},removeItem:async key=>log.removed.push(key)}},
  '@react-navigation/native':{useNavigation:()=>navigation,useFocusEffect:fn=>fn()},
  '../../context/PostJobContext':{usePostJob:()=>({jobData:{draftJobId:'draft-1'},jobChanged:changed,resetJobData:()=>log.reset++})},
  '../../../shared/postJobCancel':cancelLogic,
 })
 const cancel=usePostJobCancel({currentStep:step,busy,extraChanges})
 return {log,cancel,
  // Android: true means handled here; otherwise the navigator's normal Back runs.
  hardwareBack:()=>listeners.some(fn=>fn())?'handled':(nav.pop(1),'normal back'),
  answer:async text=>{
   const button=log.alerts.at(-1)[2].find(item=>item.text===text)
   button.onPress?.();await new Promise(resolve=>setImmediate(resolve))
  }}
}

for(const [label,entry] of Object.entries(ENTRIES))for(const step of [1,2,3,4,5])
 test(`Cancel on step ${step}, ${label}: Keep editing changes nothing, Discard leaves the wizard once`,async()=>{
  const nav=open(entry,step),before=nav.getState(),edit=entry.params?.mode==='edit'
  const {cancel,log,answer}=mount({nav,step})
  cancel()
  assert.equal(log.alerts.length,1)
  const discard=edit?'Discard changes':'Discard job'
  assert.deepEqual(Array.from(log.alerts[0][2],item=>[item.text,item.style]),[['Keep editing','cancel'],[discard,'destructive']])
  await answer('Keep editing')
  assert.equal(nav.getState(),before);assert.equal(log.reset,0);assert.equal(log.parentBack,0)
  cancel();await answer(discard)
  assert.deepEqual(nav.names(),entry.back)
  assert.equal(log.reset,1);assert.equal(log.parentBack,entry.parentBack?1:0)
  await answer(discard);cancel()
  assert.deepEqual(nav.names(),entry.back);assert.equal(log.alerts.length,2)
 })

for(const step of [1,2,3,4,5])test(`nothing entered: Cancel on step ${step} leaves without asking`,()=>{
 const nav=open(ENTRIES['edit from a job'],step)
 const {cancel,log}=mount({nav,step,changed:false})
 cancel()
 assert.equal(log.alerts.length,0);assert.deepEqual(nav.names(),['ActivityMain','ManageTask'])
})

test('Android Back: asks on step 1, goes back one step on 2 to 5, and waits while saving',async()=>{
 const entry=ENTRIES['new job from the board']
 const one=open(entry,1),first=mount({nav:one,step:1})
 assert.equal(first.hardwareBack(),'handled');assert.equal(first.log.alerts.length,1)
 assert.deepEqual(one.names(),['JobsBoard','PostJob'])
 await first.answer('Discard job');assert.deepEqual(one.names(),['JobsBoard'])
 const clean=open(entry,1),blank=mount({nav:clean,step:1,changed:false})
 assert.equal(blank.hardwareBack(),'handled');assert.deepEqual(clean.names(),['JobsBoard'])
 for(const step of [2,3,4,5]){
  const nav=open(entry,step),screen=mount({nav,step})
  assert.equal(screen.hardwareBack(),'normal back');assert.equal(screen.log.alerts.length,0)
  assert.deepEqual(nav.names(),['JobsBoard','PostJob',...STEPS.slice(0,step-2)])
 }
 const saving=open(entry,5),held=saving.getState(),busy=mount({nav:saving,step:5,busy:true})
 assert.equal(busy.hardwareBack(),'handled');busy.cancel()
 assert.equal(saving.getState(),held);assert.equal(busy.log.alerts.length,0)
 assert.equal(busy.log.options.gestureEnabled,false)
 assert.equal(mount({nav:open(entry,1),step:1}).log.options.gestureEnabled,false)
 assert.equal(mount({nav:open(entry,3),step:3}).log.options.gestureEnabled,true)
})

test('words typed to the AI helper count as entered',()=>{
 const {cancel,log}=mount({nav:open(ENTRIES['new job from the board'],1),step:1,changed:false,extraChanges:true})
 cancel();assert.equal(log.alerts.length,1)
})

test('a guest\'s saved draft is dropped only when it is the job being discarded',async()=>{
 const run=async stored=>{
  const screen=mount({nav:open(ENTRIES.guest,5),step:5,stored})
  screen.cancel();await screen.answer('Discard job');return screen.log.removed
 }
 assert.deepEqual(await run(JSON.stringify({id:'draft-1'})),['pendingJob'])
 assert.deepEqual(await run(JSON.stringify({id:'another'})),[])
 assert.deepEqual(await run('not json'),[])
 assert.deepEqual(await run(null),[])
 // If that copy can't be removed it would post after sign-in, so stay and say so.
 const nav=open(ENTRIES.guest,5),before=nav.getState(),failed=mount({nav,step:5,storageFails:true})
 failed.cancel();await failed.answer('Discard job')
 assert.equal(nav.getState(),before);assert.equal(failed.log.reset,0);assert.equal(failed.log.alerts.at(-1)[0],'Could not discard the job')
})

test('an extra Location screen after tracing an area still exits fully and is still an edit',()=>{
 const entry=ENTRIES['edit from a job'],nav=open(entry,2)
 nav.go('AreaTracer');nav.go('PostJobStep2Location',{areaResult:{}});nav.go('PostJobStep3Details',{})
 assert.equal(wizardIsEdit(nav.getState()),true)
 nav.pop(wizardExit(nav.getState()).pop)
 assert.deepEqual(nav.names(),['ActivityMain','ManageTask'])
 assert.match(cancelPrompt(true).message,/The job itself is kept/)
})

// The real provider, to check what counts as a change.
function provider(){
 const slots=[];let i=0
 const react={createContext:()=>({Provider:'Provider'}),useContext:()=>({}),
  useState:init=>{const at=i++;if(!(at in slots))slots[at]=typeof init==='function'?init():init
   return [slots[at],next=>{slots[at]=typeof next==='function'?next(slots[at]):next}]},
  useRef:init=>{const at=i++;slots[at]??={current:init};return slots[at]}}
 const {PostJobProvider}=load('context/PostJobContext.js',{react:{...react,default:react,__esModule:true},
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  '../lib/draftId':{newJobId:()=>'draft'},'../../shared/postJobCancel':cancelLogic})
 return ()=>{i=0;return PostJobProvider({children:null}).props.value}
}
test('each field the member can change counts; values the wizard fills in do not; saving clears it',()=>{
 const value=provider()
 assert.equal(value().jobChanged,false)
 value().startJobBaseline({title:'Fix fence'});value().updateJobData({title:'Fix fence'})
 assert.equal(value().jobChanged,false)
 value().updateJobData({materialsType:'none',locationArea:'Waitoki',inviteProviderId:'p',propertyService:'Gates'})
 assert.equal(value().jobChanged,false)
 value().markAutomatic({latitude:-36.5,longitude:174.5,jobAddress:'Waitoki'})
 value().updateJobData({latitude:-36.5,longitude:174.5,jobAddress:'Waitoki'})
 assert.equal(value().jobChanged,false)
 const clean={...value().jobData}
 for(const change of [{title:'Fix gate'},{category:'Fencing & Gates'},{description:'x'},{locationNote:'Back gate'},{jobAddress:'Elsewhere'},
  {scheduleType:'asap'},{scheduledDate:'2026-12-01'},{dateFrom:'2026-12-01'},{dateTo:'2026-12-02'},{latitude:-37},{longitude:175},
  {areaPolygon:[{latitude:1,longitude:2}]},{photos:[{uri:'a.jpg'}]},{primaryPhoto:{uri:'p.jpg'}},{priceType:'offers'},{price:'50'},
  {materialsType:'provider'},{accessConditions:['gate']},{hideExactLocation:false}]){
  value().updateJobData(change);assert.equal(value().jobChanged,true,JSON.stringify(change))
  value().updateJobData(clean);assert.equal(value().jobChanged,false,'undone '+JSON.stringify(change))
 }
 value().updateJobData({title:'Changed'});value().resetJobData()
 assert.equal(value().jobChanged,false)
 value().updateJobData({title:'late update'});assert.equal(value().jobChanged,false)
})

test('opening a job to edit or repeat is not a change, whatever form its dates and numbers are in',()=>{
 const saved={title:'Mow ',scheduledDate:'2026-12-01T11:00:00+00:00',price:'80',latitude:'-36.5',photos:['a.jpg'],areaPolygon:null,hideExactLocation:false}
 const form={title:'Mow',scheduledDate:'2026-12-02',price:'80',latitude:-36.5,photos:['a.jpg'],areaPolygon:[],hideExactLocation:false,materialsType:'none'}
 assert.equal(jobDraftChanged(saved,form),false)
 assert.equal(jobDraftChanged(saved,{...form,photos:[]}),true)
 const repeat=repeatJobToJobData({id:'j',title:'Mow',price:80,photos:['a.jpg'],schedule_type:'asap'})
 assert.equal(jobDraftChanged(repeat,{...repeat}),false)
})

test('every step shows Back and Cancel correctly; saving disables leaving',()=>{
 const jsx=(type,props)=>({type,props}),seen=[]
 const header=load('screens/postjob/PostJobHeader.js',{react:{},'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-native':{StyleSheet:{create:value=>value},View:'View',Text:'Text',TouchableOpacity:'Button'},
  '@react-navigation/native':{useNavigation:()=>({getState:()=>({routeNames:['PostJob']}),popTo(){}})},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0})},'../../theme/tokens':{colors:{}},
  '../../components/Icon':{default:()=>null,__esModule:true},'../../components/SideHeader':{default:()=>null,__esModule:true},
  './usePostJobCancel':{usePostJobCancel:options=>()=>seen.push(options)}}).default
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).filter(Boolean).flatMap(nodes)]
 const buttons=(props,label)=>nodes(header(props)).filter(node=>node.props?.accessibilityLabel===label)
 for(const currentStep of [1,2,3,4,5]){
  let back=0
  const props={currentStep,onBack:()=>back++}
  const [cancel,...rest]=buttons(props,'Cancel')
  assert.equal(rest.length,0);assert.equal(cancel.props.disabled,false)
  cancel.props.onPress();assert.equal(seen.at(-1).currentStep,currentStep)
  const goBack=buttons(props,'Go back')
  assert.equal(goBack.length,currentStep===1?0:1)
  goBack[0]?.props.onPress();assert.equal(back,currentStep===1?0:1)
 }
 assert.equal(buttons({currentStep:5,busy:true,onBack(){}},'Cancel')[0].props.disabled,true)
 assert.equal(buttons({currentStep:5,busy:true,onBack(){}},'Go to Basics')[0].props.disabled,true)
 for(const file of ['PostJobStep1JobType','PostJobStep2Location','PostJobStep3Details','PostJobStep4Budget','PostJobStep5Review'])
  assert.match(read('screens/postjob/'+file+'.js'),/<PostJobHeader/)
 assert.match(read('screens/postjob/PostJobStep5Review.js'),/busy=\{!!uploadStatus\}/)
 assert.equal((read('screens/postjob/PostJobStep1JobType.js').match(/startJobBaseline\(/g)||[]).length,3)
})
