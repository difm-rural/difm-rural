import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as summary from '../shared/homeSummary.ts'
import * as modes from '../shared/homeMode.ts'
import * as lifecycle from '../src/lib/lifecycle.js'
import * as estimate from '../shared/listingEstimate.ts'
import * as formatting from '../shared/formatting.js'
import * as location from '../shared/bookingLocation.ts'
import * as help from '../shared/findLocalHelp.ts'
import {bookingNextMove,jobNextMove} from '../shared/nextMove.ts'
import {rankOnTheGo} from '../shared/onTheGo.ts'
const require=createRequire(import.meta.url),jsx=(type,props)=>({type,props})
const source=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
const booking={id:'booking',provider_id:'provider',requester_id:'requester',status:'pending',service:{title:'Grazing for winter cattle',kind:'grazing',pricing_type:'fixed'}}
function screen(file,{states={},route={},record=booking}={}){
 let index=0;const calls=[],writes=[],alerts=[]
 const react={useState(v){const at=index++;return [at in states?states[at]:typeof v==='function'?v():v,()=>{}]},useEffect(){},useCallback:f=>f,useRef:v=>({current:v})};react.default=react
 const mods={react:{...react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{Platform:{OS:'android'},StyleSheet:{create:v=>v},Alert:{alert:(...v)=>alerts.push(v)},...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','RefreshControl','FlatList','KeyboardAvoidingView'].map(n=>[n,n]))},
  '@react-navigation/native':{useFocusEffect(){}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{}},
  '../../../shared/homeSummary':summary,'../../../shared/homeMode':modes,'../../../shared/onTheGo':{rankOnTheGo},
  '../../shared/formatting.js':formatting,'../../shared/formatting':formatting,'../../shared/bookingLocation':location,'../../shared/findLocalHelp':help,
 }
 const code=require('@babel/core').transformSync(source('src/screens/'+file),{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
 const exports={};new Function('exports','require',code+(file.includes('ActivityTab')?'\nexports.BookingWorkCard=BookingWorkCard;':''))(exports,name=>{
  if(name in mods)return mods[name]
  if(name.endsWith('/tokens'))return {colors:{}}
  if(name.endsWith('/lifecycle'))return lifecycle
  if(name.endsWith('/listingEstimate'))return estimate
  if(name.endsWith('/nextMove'))return {bookingNextMove,jobNextMove}
  if(name.endsWith('/roles'))return {canProvide:()=>true}
  if(name.endsWith('/bookingActions'))return new Proxy({},{get:(_,action)=>async(...v)=>{writes.push([action,...v]);return {error:null}}})
  if(name.includes('/components/'))return {__esModule:true,default:name.split('/').at(-1),CARD_GAP:12,SNAP_INTERVAL:276}
  if(name.includes('/lib/')||name.includes('/shared/'))return {}
  throw Error('Missing '+name)
 })
 const navigation={navigate:(...v)=>calls.push(v),getParent:()=>({navigate:(...v)=>calls.push(v)}),setParams(){}}
 const tree=exports.default({route:{params:{booking:record,viewerRole:'provider',...route}},navigation})
 return {tree,all:nodes(tree),calls,writes,alerts,card:props=>exports.BookingWorkCard(props)}
}
test('Needs attention, On the go and focused Active work all lead to the same booking details without mutations',()=>{
 const nextMove=bookingNextMove(booking,'provider'),active={id:'next',entityId:booking.id,entityType:'booking',viewerRole:'provider',title:booking.service.title,item:booking,nextMove,needsAction:true}
 const home=screen('tabs/HomeTabScreen.js',{states:{0:'provider',1:'work',3:0,4:[],8:[active],9:false}})
 const bookingLinks=home.all.filter(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel?.startsWith(booking.service.title))
 assert.equal(bookingLinks.length,2);bookingLinks.forEach(n=>n.props.onPress())
 const expected=['ServiceBookingDetail',{booking,viewerRole:'provider'}]
 assert.deepEqual(home.calls,[expected,expected]);assert.deepEqual(home.writes,[])
 const metric=home.all.find(n=>n.props?.accessibilityLabel==='1 Active work');assert.ok(metric);metric.props.onPress()
 assert.deepEqual(home.calls.at(-1),['Activity',{screen:'ActivityMain',params:{homeFocus:'work'}}])
 const activity=screen('tabs/ActivityTabScreen.js',{states:{0:{role:'provider'},5:[booking],11:false},route:home.calls.at(-1)[1].params})
 const list=activity.all.find(n=>n.type==='FlatList'&&n.props.data.includes(booking));assert.ok(list);assert.equal(list.props.horizontal,false)
 const card=list.props.renderItem({item:booking});assert.equal(card.props.fullWidth,true);assert.equal(card.props.detailsOnly,true)
 const all=nodes(card.type(card.props)),controls=all.filter(n=>n.type==='TouchableOpacity')
 assert.deepEqual(controls.map(n=>n.props.accessibilityLabel),['View booking details'])
 controls[0].props.onPress();assert.deepEqual(activity.calls,[expected]);assert.deepEqual(activity.writes,[])
})
test('ordinary Activity Review request is navigation, with no quick acceptance API',()=>{
 const activity=screen('tabs/ActivityTabScreen.js',{states:{0:{role:'provider'},5:[booking],11:false}})
 const list=activity.all.find(n=>n.type==='FlatList'&&n.props.data.includes(booking)),card=list.props.renderItem({item:booking})
 const review=nodes(card.type(card.props)).find(n=>n.props?.accessibilityLabel==='View booking details')
 assert.ok(review);review.props.onPress();assert.equal(activity.calls.at(-1)[0],'ServiceBookingDetail');assert.deepEqual(activity.writes,[])
 assert.doesNotMatch(source('src/screens/tabs/ActivityTabScreen.js'),/apiConfirmBooking\(|Confirm booking/)
})
for(const status of ['pending','confirmed'])test(`focused ${status} grazing card exposes no mutation controls`,()=>{
 const activity=screen('tabs/ActivityTabScreen.js',{states:{11:false}})
 const writes=[],all=nodes(activity.card({booking:{...booking,status},viewerRole:'provider',detailsOnly:true,onPress(){},onDecline:()=>writes.push('decline'),onReady:()=>writes.push('complete')}))
 assert.deepEqual(all.filter(n=>n.type==='TouchableOpacity').map(n=>n.props.accessibilityLabel),['View booking details'])
 assert.deepEqual(writes,[])
})
test('acceptance requires an explicit confirmation and preserves the existing pending-state guard',async()=>{
 const detail=screen('ServiceBookingDetailScreen.js')
 const button=detail.all.find(n=>n.type==='Button'&&n.props.title==='Accept booking request')
 assert.ok(button);assert.equal(button.props.style.flexBasis,'100%')
 assert.deepEqual(detail.writes,[]);button.props.onPress();assert.deepEqual(detail.writes,[])
 const [title,message,options]=detail.alerts[0];assert.equal(title,'Accept booking request?');assert.match(message,/confirms the booking with the requester/)
 assert.equal(options[0].style,'cancel');assert.equal(options[0].onPress,undefined)
 assert.equal(options[1].text,'Accept booking request');await options[1].onPress()
 assert.deepEqual(detail.writes,[['updateBookingStatus',booking.id,'confirmed',[lifecycle.BOOKING_STATUS.PENDING]]])
})
test('requesters, confirmed bookings and quote requests do not expose provider acceptance',()=>{
 for(const options of [{route:{viewerRole:'requester'}},{record:{...booking,status:'confirmed'}},{record:{...booking,service:{...booking.service,pricing_type:'quote_required'}}}]){
  const detail=screen('ServiceBookingDetailScreen.js',options)
  assert.ok(!detail.all.some(n=>n.type==='Button'&&n.props.title==='Accept booking request'))
  assert.deepEqual(detail.writes,[])
 }
})
test('web Activity already links to the full details route, and acceptance is explicitly labelled',()=>{
 const activity=source('provider-web/src/app/activity/page.tsx'),start=activity.indexOf('{shownBookings.length>0'),end=activity.indexOf('{shownThreads.length>0',start),bookings=activity.slice(start,end)
 assert.match(bookings,/href=\{'\/bookings\/'\+b.id\}/)
 assert.match(bookings,/View details & actions/);assert.doesNotMatch(bookings,/<ActionForm|respondBooking/)
 const detail=source('provider-web/src/app/activity/booking-details.tsx')
 assert.match(detail,/Accept booking request/);assert.match(detail,/This accepts the request and confirms the booking/)
})
