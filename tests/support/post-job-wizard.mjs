// Runs the real Post a Job screens, context and area tracer on the real stack
// router. Only React, React Native, native modules and the network are faked.
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
const {StackRouter,CommonActions,StackActions}=require('@react-navigation/routers')
const src=new URL('../../src/',import.meta.url)
const compile=path=>require('@babel/core').transformSync(readFileSync(new URL(path,src),'utf8'),{configFile:false,babelrc:false,
 presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code

const real={}
for(const name of ['categories','dates','formatting.js','jobAnswers','jobEdit','jobGuidance','jobSuggestion','locality','photos','postJobCancel','postingDates','postingMoney','postingText','publicArea','submission'])
 real['../../../shared/'+name]=real['../../shared/'+name]=await import('../../shared/'+name)
for(const name of ['categories','quickPickDates','repeatJob','draftId'])
 real['../../lib/'+name]=real['../lib/'+name]=await import('../../src/lib/'+name+'.js')

const SCREENS={PostJob:'PostJobStep1JobType',PostJobStep2Location:'PostJobStep2Location',PostJobStep3Details:'PostJobStep3Details',
 PostJobStep4Budget:'PostJobStep4Budget',PostJobStep5Review:'PostJobStep5Review'}
const code=Object.fromEntries(Object.entries(SCREENS).map(([route,file])=>[route,compile('screens/postjob/'+file+'.js')]))
code.AreaTracer=compile('components/AreaTracerScreen.js')
const contextCode=compile('context/PostJobContext.js')

const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)]
export const flush=async()=>{for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve))}

export function openWizard({row,params}){
 const log={updates:[],inserts:[],rpc:[],alerts:[],gps:0,areaFails:false}
 let current=null,dirty=false
 const hooks={
  useState(init){const me=current,at=me.i++;if(!(at in me.slots))me.slots[at]=typeof init==='function'?init():init
   return [me.slots[at],next=>{const value=typeof next==='function'?next(me.slots[at]):next;if(!Object.is(value,me.slots[at])){me.slots[at]=value;dirty=true}}]},
  useRef(init){const me=current,at=me.i++;me.slots[at]??={current:init};return me.slots[at]},
  useCallback:fn=>fn,
  useEffect(fn,deps){const me=current,at=me.i++,old=me.slots[at]
   if(!old||!deps||deps.some((value,i)=>!Object.is(value,old[i]))){me.slots[at]=deps??[];me.effects.push(fn)}},
 }
 const element=(type,props)=>({type,props})
 const react={...hooks,createContext:()=>({Provider:'Provider'}),Fragment:'Fragment',__esModule:true}
 react.default=react
 const stub=name=>({__esModule:true,default:name})
 const answer=result=>{const chain=new Proxy({},{get:(_,key)=>key==='then'?undefined:['maybeSingle','single'].includes(key)?async()=>result():()=>chain});return chain}
 const supabase={auth:{getUser:async()=>({data:{user:{id:'me'}}})},
  from:()=>({
   update(value){const fails=log.areaFails&&'area_polygon' in value&&!('title' in value);log.updates.push(value);return answer(()=>fails?{data:null,error:{message:'x'}}:{data:{id:row?.id},error:null})},
   insert(value){log.inserts.push(value);return answer(()=>({data:{id:'new'},error:null}))}}),
  rpc:async(name,args)=>{log.rpc.push([name,args]);return {data:name==='list_job_private_photos'?[]:args.p_job??'new',error:null}},
  functions:{invoke:async()=>({data:null,error:null})}}
 const modules={
  react,'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'Fragment'},
  'react-native':{StyleSheet:{create:value=>value,absoluteFillObject:{}},Platform:{OS:'android',select:value=>value.android},Dimensions:{get:()=>({height:800,width:360})},
   Keyboard:{dismiss(){}},Alert:{alert:(...args)=>log.alerts.push(args)},Animated:{},
   ...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','Image','Modal','KeyboardAvoidingView'].map(name=>[name,name]))},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
  'react-native-maps':{...stub('MapView'),Marker:'Marker',Polygon:'Polygon'},
  'expo-location':{Accuracy:{},requestForegroundPermissionsAsync:async()=>{log.gps++;return {status:'denied'}}},
  'expo-image-picker':{},'../../lib/draftJob':{},'@react-native-async-storage/async-storage':stub({}),
  '../../theme/tokens':{colors:{}},'../theme/tokens':{colors:{}},
  '../../lib/supabase':{supabase},'../../lib/analytics':{trackEvent(){}},'../../lib/preferences':{trackCategoryInterest(){}},
  '../../lib/location':{reverseGeocode:async()=>'9 New Road, Elsewhere 0999, New Zealand',coarseSuburb:address=>address?address.split(',').map(part=>part.trim()).filter(part=>part!=='New Zealand').at(-1):''},
  '../lib/location':{haversineDistance:()=>0},'../../lib/maps':{staticMapUrl:()=>'',staticMapPolygonUrl:()=>''},
  '../../lib/categorize':{inferJobCategory:async()=>({category:'General Rural Help'})},
  '../../lib/jobPhotos':{uploadJobPhotos:async(_id,photos)=>photos.filter(photo=>typeof photo==='string'),toStorablePhoto:photo=>photo},
  '../../lib/jobPrimaryPhoto':{photoToJobEnabled:false,jobPrimaryPhotoRequest:async()=>({checksum:'c'})},
  '../../lib/photoThumbs':{removeThumbnails:async()=>{}},'../../lib/publishingLocation':{confirmPublishingLocation:async()=>true},'../../lib/shrinkPhoto':{},
  '../../components/AiJobAssistant':{...stub('AiJobAssistant'),JobAiChoice:'JobAiChoice'},
  '../../components/JobPrimaryImage':{JobPrivateGallery:'JobPrivateGallery'},
  '../../components/NativeDateTimePicker':{...stub('NativeDateTimePicker'),openDateTimePicker(){}},
  './PostJobHeader':stub('PostJobHeader'),'./Icon':stub('Icon'),
  ...Object.fromEntries(['Icon','Button','DateChips','JobPrimaryPhotoDraft','AddressAutocomplete','JobLocationMap'].map(name=>['../../components/'+name,stub(name)])),
 }
 const load=text=>{
  const exports={}
  new Function('exports','require','process','setTimeout',text)(exports,name=>{
   const found=modules[name]??real[name]
   if(!found)throw Error('No module '+name)
   return found
  },{env:{}},()=>0)
  return exports
 }
 const {PostJobProvider}=load(contextCode)
 const store={slots:[],effects:[]}
 const within=(instance,fn)=>{const before=current;current=instance;instance.i=0;try{return fn()}finally{current=before}}
 const context=()=>within(store,()=>PostJobProvider({children:null}).props.value)
 modules['../../context/PostJobContext']={usePostJob:context}
 const Screen=Object.fromEntries(Object.entries(code).map(([route,text])=>[route,load(text).default]))

 const names=['ActivityMain','ManageTask',...Object.keys(code),'JobPosted']
 const router=StackRouter({}),options={routeNames:names,routeParamList:{},routeGetIdList:{}}
 let state=router.getInitialState(options)
 const run=(action,key)=>{
  const next=router.getStateForAction(state,key?{...action,source:key,target:state.key}:action,options)
  if(next){state=next.stale===false?next:router.getRehydratedState(next,options);dirty=true}
 }
 const mounted=new Map()
 const navigation=key=>({getState:()=>state,navigate:(name,value)=>run(CommonActions.navigate(name,value),key),goBack:()=>run(CommonActions.goBack(),key),
  pop:n=>run(StackActions.pop(n),key),popTo:(name,value,opts)=>run(StackActions.popTo(name,value,opts),key),replace:(name,value)=>run(StackActions.replace(name,value),key),
  setParams:value=>run(CommonActions.setParams(value),key),reset:value=>run(CommonActions.reset(value)),getParent:()=>null})
 function settle(){
  for(let pass=0;pass<60;pass++){
   dirty=false
   for(const key of [...mounted.keys()])if(!state.routes.some(route=>route.key===key))mounted.delete(key)
   for(const route of state.routes){
    if(!Screen[route.name])continue
    if(!mounted.has(route.key))mounted.set(route.key,{slots:[],effects:[],navigation:navigation(route.key)})
    const instance=mounted.get(route.key)
    instance.tree=within(instance,()=>Screen[route.name]({navigation:instance.navigation,route:{name:route.name,key:route.key,params:route.params}}))
    for(const effect of instance.effects.splice(0))effect()
   }
   if(!dirty)return
  }
  throw Error('did not settle')
 }
 const top=()=>state.routes[state.index]
 const find=test=>nodes(mounted.get(top().key).tree).find(node=>node.props&&test(node))
 const wizard={
  log,context,names:()=>state.routes.map(route=>route.name),step:()=>top().name,params:()=>top().params,
  async act(fn){await fn();settle();await flush();settle()},
  press:label=>wizard.act(()=>find(node=>node.props.accessibilityLabel===label).props.onPress()),
  next:()=>wizard.act(()=>find(node=>node.type==='Button').props.onPress()),
  type:(label,value)=>wizard.act(()=>find(node=>node.props.accessibilityLabel===label).props.onChangeText(value)),
  choose:text=>wizard.act(()=>find(node=>node.type==='TouchableOpacity'&&nodes(node).some(child=>child.props?.children===text)).props.onPress()),
  texts:()=>nodes(mounted.get(top().key).tree).filter(node=>node.type==='Text'&&typeof node.props.children==='string').map(node=>node.props.children),
  selected:()=>nodes(mounted.get(top().key).tree).filter(node=>node.props?.accessibilityState?.selected).map(node=>nodes(node).find(child=>child.type==='Text').props.children),
  back:()=>wizard.act(()=>find(node=>node.type==='PostJobHeader').props.onBack()),
  map:point=>wizard.act(()=>find(node=>node.type==='JobLocationMap').props.onLocationSelect(point)),
  tap:point=>wizard.act(()=>find(node=>node.type==='MapView').props.onPress({nativeEvent:{coordinate:point}})),
  open:next=>wizard.act(()=>run(CommonActions.navigate('PostJob',next))),
  leave:()=>wizard.act(()=>{const exit=real['../../../shared/postJobCancel'].wizardExit(state);context().resetJobData();run(StackActions.pop(exit.pop))}),
  async toReview(){for(let i=0;i<6&&wizard.step()!=='PostJobStep5Review';i++)await wizard.next()},
 }
 run(CommonActions.navigate('ManageTask'))
 return wizard.open(params??{job:row,mode:'edit',bidCount:0}).then(()=>wizard)
}
