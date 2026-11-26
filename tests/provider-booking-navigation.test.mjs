import * as tokens from '../src/theme/tokens.js'
import * as lifecycleUx from '../shared/bookingLifecycleUx.ts'
import * as bookingDuration from '../shared/bookingDuration.ts'
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
function screen(file,{states={},route={},record=booking,platform='android'}={}){
 let index=0;const calls=[],writes=[],alerts=[]
 const react={useState(v){const at=index++;return [at in states?states[at]:typeof v==='function'?v():v,()=>{}]},useEffect(){},useCallback:f=>f,useRef:v=>({current:v})};react.default=react
 const mods={'../../shared/bookingLifecycleUx':lifecycleUx,'../../shared/bookingDuration':bookingDuration,react:{...react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{Platform:{OS:platform},StyleSheet:{create:v=>v},Alert:{alert:(...v)=>alerts.push(v)},...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','RefreshControl','FlatList','KeyboardAvoidingView'].map(n=>[n,n]))},
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
  if(name.endsWith('/supabase'))return {supabase:{auth:{getUser:async()=>({data:{user:{id:'provider'}}})},rpc:async(...v)=>{writes.push(['rpc',...v]);return {error:null}}}}
  if(name.endsWith('/bookingActions'))return new Proxy({},{get:(_,action)=>async(...v)=>{writes.push([action,...v]);return action==='saveBookingReview'?{id:'saved-review',rating:5}:{error:null}}})
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
 const [title,message,options]=detail.alerts[0];assert.equal(title,'Accept booking request?');assert.match(message,/not confirming final payment/)
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

test('confirmed grazing makes Chat primary and completion secondary without truncating controls',()=>{
 const detail=screen('ServiceBookingDetailScreen.js',{record:{...booking,status:'confirmed'}})
 const buttons=detail.all.filter(n=>n.type==='Button')
 const complete=buttons.find(n=>n.props.title==='Complete booking');assert.ok(complete);assert.equal(complete.props.variant,'secondary');assert.equal(complete.props.style.width,'100%')
 assert.ok(buttons.some(n=>n.props.title?.includes('Chat')))
 complete.props.onPress();const [title,message,options]=detail.alerts[0]
 assert.equal(title,'Complete grazing arrangement?');assert.match(message,/does not collect or record payment/)
 assert.deepEqual(options.map(o=>o.text),['Cancel','Complete & Relist','Complete & Close Listing'])
 assert.equal(options[0].style,'cancel');assert.equal(options[0].onPress,undefined);assert.deepEqual(detail.writes,[])
})
for(const role of ['provider','requester'])test(`completed ${role} sees independent review or submitted state`,()=>{
 const opts={record:{...booking,status:'completed'},route:{viewerRole:role},states:{15:true}}
 const detail=screen('ServiceBookingDetailScreen.js',opts)
 assert.ok(detail.all.some(n=>n.type==='Button'&&n.props.title===(role==='provider'?'Review requester':'Leave a review')))
 const submitted=screen('ServiceBookingDetailScreen.js',{...opts,states:{15:true,12:{id:'own',rating:5,comment:'Great'}}})
 assert.ok(submitted.all.some(n=>n.type==='Button'&&n.props.title==='Edit review'))
 assert.ok(!submitted.all.some(n=>n.type==='Button'&&['Leave a review','Review requester'].includes(n.props.title)))
 const failed=screen('ServiceBookingDetailScreen.js',{...opts,states:{15:true,16:true}})
 assert.ok(failed.all.some(n=>n.type==='Button'&&n.props.title==='Retry loading review'))
 assert.ok(!failed.all.some(n=>n.type==='Button'&&['Leave a review','Review requester'].includes(n.props.title)))
})

for(const relist of [true,false])test(`completion sends only selected booking and relist=${relist}`,async()=>{
 const detail=screen('ServiceBookingDetailScreen.js',{record:{...booking,status:'confirmed'}})
 detail.all.find(n=>n.type==='Button'&&n.props.title==='Complete booking').props.onPress()
 const choice=detail.alerts[0][2].find(o=>o.text===(relist?'Complete & Relist':'Complete & Close Listing'));await choice.onPress()
 assert.deepEqual(detail.writes,[['rpc','complete_grazing_arrangement',{p_booking_id:booking.id,p_relist:relist}]])
})

test('repeated review submissions share the existing save workflow and are guarded while in flight',async()=>{
 const detail=screen('ServiceBookingDetailScreen.js',{record:{...booking,status:'completed'},states:{15:true}})
 const modal=detail.all.find(n=>n.type==='ReviewModal');assert.ok(modal)
 await Promise.all([modal.props.onSubmit({rating:5,comment:'Great'}),modal.props.onSubmit({rating:5,comment:'Great'})])
 assert.equal(detail.writes.filter(w=>w[0]==='saveBookingReview').length,1)
 assert.ok(detail.alerts.some(a=>a[0]==='Review saved'))
})

// Expand the real shared Button so label/variant regressions cannot hide behind
// the screen harness's string component stubs.
const buttonExports={}
const buttonCode=require('@babel/core').transformSync(source('src/components/Button.js'),{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
new Function('exports','require',buttonCode)(buttonExports,name=>{
 if(name==='react')return {__esModule:true,default:{}}
 if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'}
 if(name==='react-native')return {StyleSheet:{create:v=>v},...Object.fromEntries(['ActivityIndicator','Text','TouchableOpacity','View'].map(n=>[n,n]))}
 if(name==='../theme/tokens')return tokens
 if(name==='./Icon')return {__esModule:true,default:'Icon'}
 throw Error('Missing real Button dependency '+name)
})
const flattenStyle=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(v=>v&&typeof v==='object'))
for(const platform of ['android','ios'])for(const status of ['confirmed','in_progress'])for(const role of ['provider','requester'])test(`${platform} ${role} ${status} grazing footer keeps real Chat label in an explicit full-width column`,()=>{
 const detail=screen('ServiceBookingDetailScreen.js',{platform,record:{...booking,status},route:{viewerRole:role}})
 const footer=detail.all.find(n=>n.type==='View'&&Array.isArray(n.props.style)&&flattenStyle(n.props.style).borderTopWidth===1&&flattenStyle(n.props.style).gap===10)
 assert.ok(footer);const layout=flattenStyle(footer.props.style)
 assert.equal(layout.flexDirection,'column');assert.equal(layout.flexWrap,'nowrap');assert.equal(layout.alignItems,'stretch');assert.equal(layout.paddingHorizontal,16)
 const actions=nodes(footer).filter(n=>n.type==='Button'),chat=actions[0]
 assert.equal(chat.props.title,'Chat');assert.equal(chat.props.variant,'primary')
 if(role==='provider'){assert.deepEqual(actions.map(n=>n.props.title),['Chat','Complete booking']);assert.equal(actions[1].props.variant,'secondary')}
 for(const action of actions){
  const button=buttonExports.default(action.props),buttonNodes=nodes(button),style=flattenStyle(button.props.style)
  assert.equal(style.width,'100%');assert.equal(style.alignSelf,'stretch');assert.equal(style.flexBasis,undefined);assert.equal(style.flex,undefined)
  assert.equal(style.flexShrink,0);assert.equal(style.minHeight,52)
  assert.ok(buttonNodes.some(n=>n.type==='Text'&&n.props.children===action.props.title))
 }
 const rendered=buttonExports.default(chat.props),label=nodes(rendered).find(n=>n.type==='Text')
 assert.equal(flattenStyle(rendered.props.style).backgroundColor,tokens.colors.primary)
 assert.equal(flattenStyle(label.props.style).color,tokens.colors.white);assert.equal(rendered.props.accessibilityLabel,'Chat')
 rendered.props.onPress();assert.equal(detail.calls[0][0],'Chat');assert.equal(detail.calls[0][1].bookingId,booking.id);assert.deepEqual(detail.writes,[])
})
