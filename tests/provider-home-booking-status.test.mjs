import * as lifecycleUx from '../shared/bookingLifecycleUx.ts'
import * as bookingDuration from '../shared/bookingDuration.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {bookingNextMove} from '../shared/nextMove.ts'
import {homeAttentionSummary} from '../shared/homeSummary.ts'
import * as summary from '../shared/homeSummary.ts'
import * as modes from '../shared/homeMode.ts'
import {rankOnTheGo} from '../shared/onTheGo.ts'
import {bookingLocationHelp,bookingLocationPolicy,bookingPublicArea,bookingLocationFields} from '../shared/bookingLocation.ts'
import * as location from '../shared/bookingLocation.ts'
import * as lifecycle from '../src/lib/lifecycle.js'
import * as estimate from '../shared/listingEstimate.ts'
import * as pricing from '../shared/listingPricing.ts'
import * as formatting from '../shared/formatting.js'
import * as help from '../shared/findLocalHelp.ts'
import * as detail from '../provider-web/src/lib/booking-detail.ts'
const require=createRequire(import.meta.url)
const source=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
const texts=tree=>nodes(tree).filter(n=>n.type==='Text').flatMap(n=>[n.props.children].flat()).join(' ')
const booking=status=>({id:'request',status,provider_id:'viewer',requester_id:'customer',service:{title:'Long grazing request description that must remain fully readable on narrow screens',kind:'grazing',pricing_type:'fixed'}})
const move=(status,role='provider')=>{
 const item=booking(status),nextMove=bookingNextMove(item,role)
 return nextMove?{id:'next-booking',entityId:item.id,entityType:'booking',viewerRole:role,title:item.service.title,item,nextMove,needsAction:nextMove.needsAction}:null
}
test('attention reuses lifecycle decisions for pending, accepted and terminal bookings',()=>{
 assert.equal(homeAttentionSummary([move('pending')]).count,1)
 assert.equal(homeAttentionSummary([move('pending','requester')]).count,0)
 for(const status of ['withdrawn','cancelled','declined','completed','confirmed','in_progress']){
  const item=move(status)
  assert.equal(homeAttentionSummary(item?[item]:[]).count,0,status)
 }
 assert.equal(homeAttentionSummary([move('quote_sent','requester')]).count,1)
 assert.equal(homeAttentionSummary([move('quote_sent')]).count,0)
 assert.equal(homeAttentionSummary([move('cancellation_requested')]).count,1)
})
test('attention counts are unbounded, include invitation actions, and never claim caught up on lookup failure',()=>{
 assert.equal(homeAttentionSummary(Array.from({length:8},()=>move('pending')),2).count,10)
 assert.equal(homeAttentionSummary([]).text,"You're all caught up.")
 assert.equal(homeAttentionSummary([],1).text,'1 item needs your attention.')
 for(const value of [homeAttentionSummary(null),homeAttentionSummary([],null)]){
  assert.equal(value.count,null);assert.doesNotMatch(value.text,/caught up/)
 }
})
test('grazing location copy follows the viewer role; other listing policies are unchanged',()=>{
 assert.equal(bookingLocationHelp('grazing','requester'),'The provider will confirm the exact grazing location and access arrangements.')
 assert.equal(bookingLocationHelp('grazing','provider'),'Confirm the exact grazing location and access arrangements with the requester.')
 for(const kind of ['service','hire','for_sale','lease'])assert.equal(bookingLocationHelp(kind,'provider'),bookingLocationPolicy(kind).help)
 assert.equal(bookingPublicArea('123 Private Road, Cambridge 3434, New Zealand'),'Cambridge')
 assert.deepEqual(bookingLocationFields('grazing',{location:'Private',latitude:-41,longitude:174,note:'Gate code'}),{location_name:null,latitude:null,longitude:null,location_note:null})
})

// Exercise the real native Home loading and badge callbacks, with only network,
// native UI and React hooks replaced. No notification is read or deleted.
async function home(initialMoves,{unreadCount=27,invites=[]}={}){
 const slots=[],effects=[],navigation=[],inboxCalls=[];let index=0,tree,currentMoves=initialMoves,badge,loadNext
 const jsx=(type,props)=>({type,props})
 const react={useState(v){const at=index++;if(!(at in slots))slots[at]=typeof v==='function'?v():v;return [slots[at],v=>{slots[at]=typeof v==='function'?v(slots[at]):v}]},useRef(v){const at=index++;slots[at]??={current:v};return slots[at]},useCallback:f=>f}
 react.default=react
 const exports={},mods={
  react:{...react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{StyleSheet:{create:v=>v},...Object.fromEntries(['View','Text','TouchableOpacity','ScrollView','RefreshControl'].map(n=>[n,n]))},
  '@react-navigation/native':{useFocusEffect:f=>{if(!tree)effects.push(f)}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async()=> 'work',setItem:async()=>{}}},
  '../../../shared/homeMode':modes,'../../../shared/homeSummary':summary,'../../../shared/onTheGo':{rankOnTheGo},
  '../../../shared/propertyNetwork':{loadPropertyNetwork:async()=>null,propertyNetworkHomeLines:()=>[],propertyNetworkHelpCount:()=>0},
  '../../lib/supabase':{supabase:{auth:{getUser:async()=>({data:{user:{id:'viewer'}}})},from:()=>({select:()=>({eq:()=>({neq:async()=>({count:0})})})})}},
  '../../lib/notifications':{fetchNotificationInbox:async options=>{inboxCalls.push(options);return {items:[],unreadCount}}},
  '../../lib/invites':{fetchInvitedJobsForProvider:async()=>invites},
  '../../lib/seasonalReminders':{fetchSeasonalReminders:async()=>[],recordSeasonalEvent(){}},
  '../../../shared/reviewPrompts':{dismissReviewPrompt:async()=>{}},
  '../../lib/nextMove':{fetchActiveNextMoves:async()=>{if(loadNext){const next=loadNext;loadNext=null;return next()}return currentMoves}},
  '../../lib/badgeEvents':{onBadgeRefresh:f=>{badge=f;return ()=>{}}},'../../theme/tokens':{colors:{}},
 }
 const code=require('@babel/core').transformSync(source('src/screens/tabs/HomeTabScreen.js'),{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
 new Function('exports','require',code)(exports,name=>{
  if(name in mods)return mods[name]
  if(name.includes('/components/'))return {__esModule:true,default:name.split('/').at(-1)}
  throw Error('Missing '+name)
 })
 const nav={navigate:(...v)=>navigation.push(v),getParent:()=>({navigate:(...v)=>navigation.push(v)})}
 const render=()=>{index=0;tree=exports.default({navigation:nav});return tree}
 const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));render()}
 render();effects.forEach(f=>f());await settle()
 return {render,settle,navigation,inboxCalls,text:()=>texts(render()),nodes:()=>nodes(render()),refresh:()=>badge(),setMoves:v=>{currentMoves=v},deferNext:fn=>{loadNext=fn}}
}
test('native Home ignores unread history after withdrawal and keeps its unread count independently',async()=>{
 const screen=await home([move('pending')])
 assert.match(screen.text(),/1 item needs your attention/)
 assert.match(screen.text(),/Confirm or decline the booking/)
 const title=screen.nodes().find(n=>n.type==='Text'&&n.props.children===booking('pending').service.title)
 assert.ok(title);assert.equal(title.props.numberOfLines,undefined)
 const row=screen.nodes().find(n=>n.props?.accessibilityLabel?.startsWith(booking('pending').service.title))
 row.props.onPress();assert.equal(screen.navigation.at(-1)[0],'ServiceBookingDetail')
 screen.setMoves([]);screen.refresh();await screen.settle()
 assert.match(screen.text(),/Nothing needs your action. 27 unread updates in Notifications./)
 assert.match(screen.text(),/27 unread updates in Notifications/);assert.doesNotMatch(screen.text(),/All notifications/)
 assert.doesNotMatch(screen.text(),/Confirm or decline|Needs attention/)
 assert.ok(screen.inboxCalls.every(options=>options.limit===0))
})
test('a slower old native Home response cannot resurrect a withdrawn request',async()=>{
 const screen=await home([move('pending')]);let resolveOld
 screen.deferNext(()=>new Promise(resolve=>{resolveOld=resolve}));screen.refresh();await screen.settle()
 screen.setMoves([]);screen.refresh();await screen.settle()
 resolveOld([move('pending')]);await screen.settle()
 assert.match(screen.text(),/Nothing needs your action. 27 unread updates in Notifications./);assert.doesNotMatch(screen.text(),/Confirm or decline/)
})
test('native Home shows a safe summary when lifecycle retrieval fails',async()=>{
 const screen=await home(null)
 assert.doesNotMatch(screen.text(),/caught up/);assert.match(screen.text(),/summary unavailable/)
})

function nativeDetail(role,privateLocation=false,status='pending',overrides={}){
 const jsx=(type,props)=>({type,props}),exports={}
 const react={useState:v=>[typeof v==='function'?v():v,()=>{}],useEffect(){},useRef:v=>({current:v})};react.default=react
 const imports={'../../shared/bookingLifecycleUx':lifecycleUx,'../../shared/bookingDuration':bookingDuration,react:{...react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{Platform:{OS:'android'},StyleSheet:{create:v=>v},...Object.fromEntries(['View','Text','TouchableOpacity','ScrollView','KeyboardAvoidingView','TextInput'].map(n=>[n,n]))},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'../lib/lifecycle':lifecycle,
  '../lib/listingEstimate':estimate,'../lib/nextMove':{bookingNextMove},'../../shared/bookingLocation':location,
  '../../shared/formatting.js':formatting,'../../shared/formatting':formatting,'../../shared/findLocalHelp':help,'../theme/tokens':{colors:{}},
 }
 const code=require('@babel/core').transformSync(source('src/screens/ServiceBookingDetailScreen.js'),{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
 new Function('exports','require',code)(exports,name=>{
  if(name in imports)return imports[name]
  if(name.includes('/components/'))return {__esModule:true,default:name.split('/').at(-1)}
  if(name.includes('/lib/'))return {}
  throw Error('Missing '+name)
 })
 const service={...booking('pending').service,pricing_type:'per_unit',rate:50,unit_label:'head/week',location_name:'123 Private Road, Cambridge 3434, New Zealand'}
 const record={...booking(status),quantity:2,total_amount:100,expected_duration:4,expected_duration_unit:'week',pricing_snapshot:bookingDuration.mobilePricingSnapshot(service,null,2),location_name:privateLocation?'Authorized booking address':null,service,...overrides}
 const tree=exports.default({route:{params:{booking:record,viewerRole:role}},navigation:{}})
 const expand=n=>!n||typeof n!=='object'?n:Array.isArray(n)?n.map(expand):typeof n.type==='function'&&n.type.name==='DetailRow'?expand(n.type(n.props)):{...n,props:{...n.props,children:expand(n.props?.children)}}
 return nodes(expand(tree))
}
for(const role of ['requester','provider'])test(`native grazing details show ${role} wording, public area first and only supplied private data`,()=>{
 const all=nativeDetail(role),copy=all.filter(n=>n.type==='Text').map(n=>n.props.children).flat().join(' ')
 assert.ok(copy.includes(bookingLocationHelp('grazing',role)))
 assert.match(copy,/4 weeks/);assert.match(copy,/\$400/)
 const confirmed=nativeDetail(role,false,'confirmed').filter(n=>n.type==='Text').map(n=>n.props.children).flat().join(' ');assert.match(confirmed,/4 weeks/);assert.match(confirmed,/\$400/)
 assert.match(copy,/Cambridge/);assert.doesNotMatch(copy,/123 Private Road|Authorized booking address/)
 const authorized=nativeDetail(role,true).filter(n=>n.type==='Text').map(n=>n.props.children).flat().join(' ')
 assert.ok(authorized.indexOf('Cambridge')<authorized.indexOf('Authorized booking address'))
})
for(const role of ['requester','provider'])test(`web grazing details use ${role} wording and keep authorized private data secondary`,()=>{
 const webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url)),jsx=webRequire('react/jsx-runtime'),{renderToStaticMarkup}=webRequire('react-dom/server'),ts=require('typescript')
 const imports={'@shared/bookingLifecycleUx':lifecycleUx,'@shared/nextMove':{bookingNextMove},'@/lib/work':{statusLabel:lifecycle.bookingStatusLabel},'@shared/bookingDuration':bookingDuration,'react/jsx-runtime':jsx,'@shared/bookingLocation':location,'@shared/formatting':formatting,'@shared/listingPricing':pricing,
  '@/lib/booking-detail':detail,'@/components/navigation-link':{default:'a'},'@/components/action-form':{ActionForm:({children})=>jsx.jsx('div',{children})},'./quote-form':{QuoteForm:()=>null},'../work-actions':{respondBooking(){throw Error('No writes')}}}
 const code=ts.transpileModule(source('provider-web/src/app/activity/booking-details.tsx'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,exports={}
 new Function('exports','require',code)(exports,name=>{assert.ok(name in imports,name);return imports[name]})
 const service={...booking('pending').service,pricing_type:'per_unit',rate:50,unit_label:'head/week',location_name:'123 Private Road, Cambridge 3434, New Zealand'}
 const record={...booking('confirmed'),service_id:'listing',quantity:2,total_amount:100,expected_duration:4,expected_duration_unit:'week',pricing_snapshot:bookingDuration.mobilePricingSnapshot(service,null,2),location_name:null,service}
 const render=b=>renderToStaticMarkup(jsx.jsx(exports.BookingDetails,{booking:b,userId:role==='provider'?'viewer':'customer'}))
 const html=render(record)
 assert.match(html,/Expected duration: 4 weeks/);assert.match(html,/Estimated total: \$400/)
 assert.doesNotMatch(html,/Base estimate at request/);assert.equal((html.match(/Estimated weekly cost/g)||[]).length,1)
 assert.ok(html.includes('<p class="muted booking-pricing-explanation">'+lifecycleUx.BOOKING_PRICING_EXPLANATION+'</p>'))
 assert.match(html,/Estimated total: \$400<\/strong><\/p><p class="muted booking-pricing-explanation">/)
 for(const pricing_snapshot of [record.pricing_snapshot,null]){
  const legacy=render({...record,expected_duration:null,expected_duration_unit:null,pricing_snapshot,service:{...service,rate:999}})
  assert.match(legacy,/Estimated weekly cost: \$100/);assert.match(legacy,/Estimated total: To be agreed/)
  assert.doesNotMatch(legacy,/Base estimate at request|Estimated weekly cost: \$1,998/)
 }
 assert.match(render({...record,service:{...service,kind:'service'}}),/Base estimate at request/)

 assert.ok(html.includes(bookingLocationHelp('grazing',role,'confirmed',service.location_name,false)))
 assert.match(html,/<strong>Cambridge<\/strong>/);assert.doesNotMatch(html,/123 Private Road|Private booking location:/)
 const authorized=render({...record,location_name:'Authorized booking address'})
 assert.match(authorized,/<p class="muted">Private booking location: Authorized booking address<\/p>/)
 assert.ok(authorized.indexOf('Cambridge')<authorized.indexOf('Authorized booking address'))
})

for(const role of ['requester','provider'])for(const legacy of [false,true])test(`native ${role} grazing pricing removes duplicate base row with ${legacy?'no duration':'duration and total'}`,()=>{
 const all=nativeDetail(role,false,'confirmed',legacy?{expected_duration:null,expected_duration_unit:null}:{}),texts=all.filter(n=>n.type==='Text')
 const copy=texts.flatMap(n=>n.props.children).join(' ')
 assert.doesNotMatch(copy,/Base estimate/);assert.equal(texts.filter(n=>n.props.children==='Estimated weekly cost').length,1)
 assert.match(copy,/\$100/);assert.match(copy,legacy?/To be agreed/:/\$400/)
 const at=texts.findIndex(n=>n.props.children===lifecycleUx.BOOKING_PRICING_EXPLANATION);assert.ok(at>=0)
 assert.equal(texts[at-2].props.children,'Estimated total')
 assert.equal(texts[at].props.style.textAlign,'left');assert.equal(texts[at].props.style.fontWeight,'400');assert.equal(texts[at].props.style.fontSize,12)
})
for(const role of ['requester','provider'])test(`native legacy ${role} keeps the saved one-week amount without reconstructing a live rate`,()=>{
 const all=nativeDetail(role,false,'confirmed',{expected_duration:null,expected_duration_unit:null,pricing_snapshot:null,service:{kind:'grazing',pricing_type:'per_unit',rate:999,unit_label:'head/week'}})
 const copy=all.filter(n=>n.type==='Text').flatMap(n=>n.props.children).join(' ')
 assert.match(copy,/Estimated weekly cost/);assert.match(copy,/\$100/);assert.doesNotMatch(copy,/Base estimate|\$1,998|\$999/)
})
test('non-grazing mobile booking retains its base estimate',()=>{
 const all=nativeDetail('provider',false,'confirmed',{expected_duration:null,expected_duration_unit:null,pricing_snapshot:null,service:{kind:'service',pricing_type:'fixed',rate:100}})
 assert.ok(all.some(n=>n.type==='Text'&&n.props.children==='Base estimate'))
})

test('web pricing explanation uses a small normal-weight left-aligned style',()=>{
 assert.match(source('provider-web/src/app/globals.css'),/\.work-detail \.booking-pricing-explanation\s*\{[^}]*font-size: 13px;[^}]*font-weight: 400;[^}]*text-align: left;/)
})
