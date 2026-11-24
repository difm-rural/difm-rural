import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as groups from '../shared/notificationGroups.ts'
import {notificationHint} from '../shared/notificationHints.ts'
import {notificationBody} from '../shared/notificationBody.ts'
import {notificationHref} from '../provider-web/src/lib/work.ts'
import {sideTag} from '../shared/marketSide.ts'
const require=createRequire(import.meta.url)
const code=require('@babel/core').transformSync(readFileSync(new URL('../src/screens/NotificationsScreen.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
function screen({events=[],count=events.filter(n=>!n.read).length,failMark=false,failLoad=false}={}){
 const state=[],calls=[],effects=[];let index=0,lastFilter,tree
 const jsx=(type,props)=>({type,props})
 const react={useState(init){const at=index++;if(!(at in state))state[at]=typeof init==='function'?init():init;return [state[at],v=>state[at]=typeof v==='function'?v(state[at]):v]},useRef(init){const at=index++;state[at]??={current:init};return state[at]},useCallback:fn=>fn}
 const modules={react:{...react,default:react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'../../shared/notificationGroups':groups,'../../shared/notificationHints':{notificationHint},'../../shared/notificationBody':{notificationBody},'../../shared/marketSide':{notificationSide:()=>null,sideTag:()=>null},'../../shared/stackNavigation':{stackRootAction:()=>null},'../lib/supabase':{supabase:{auth:{getUser:async()=>({data:{user:{id:'viewer'}}})}}},'../theme/tokens':{colors:{}},'@react-navigation/native':{useFocusEffect(fn){const filter=state[0];if(lastFilter!==filter){lastFilter=filter;effects.push(fn)}}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'react-native':{...Object.fromEntries(['SectionList','RefreshControl','Text','TouchableOpacity','View'].map(x=>[x,x])),StyleSheet:{create:x=>x},AppState:{addEventListener:()=>({remove(){}})}},'../lib/badgeEvents':{onBadgeRefresh:()=>()=>{},requestBadgeRefresh(){}},'../lib/notifications':{NOTIFICATION_ICONS:{},async fetchNotificationInbox(options){calls.push(options);if(failLoad)throw Error('offline');return {items:events.filter(n=>!options.unreadOnly||!n.read),unreadCount:count}},async markAllNotificationsRead(){if(failMark)throw Error('offline');events=events.map(n=>({...n,read:true}));count=0;return true},openNotificationTarget:async()=>true},...Object.fromEntries(['Icon','EmptyState','Loading'].map(x=>['../components/'+x,{__esModule:true,default:x}]))}
 const exp={};new Function('exports','require','setInterval','clearInterval',code)(exp,name=>{if(!(name in modules))throw Error(name);return modules[name]},()=>1,()=>{})
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
 const render=()=>{index=0;tree=exp.default({navigation:{},route:{}});return tree}
 const all=()=>nodes(render())
 async function settle(){render();while(effects.length)effects.shift()();await new Promise(setImmediate);render()}
 render()
 return {calls,settle,all,find:(type,p=()=>true)=>all().find(n=>n.type===type&&p(n.props)),text:()=>all().filter(n=>n.type==='Text').flatMap(n=>[n.props.children].flat()).join(' ')}
}
const events=[{id:'one',type:'new_question',body:'A long question',read:false,created_at:new Date().toISOString()},{id:'two',read:true,body:'Old',created_at:'2020-01-01T00:00:00Z'}]
test('mobile filters before display, shows full unread count and refreshes the selected filter',async()=>{
 const s=screen({events,count:123});await s.settle();assert.match(s.text(),/Unread \(123\)/)
 let list=s.find('SectionList');assert.equal(list.props.sections.flatMap(g=>g.data).length,2)
 s.find('TouchableOpacity',p=>p.accessibilityRole==='tab'&&!p.accessibilityState.selected).props.onPress();await s.settle()
 list=s.find('SectionList');assert.equal(list.props.sections.flatMap(g=>g.data).length,1)
 list.props.refreshControl.props.onRefresh();await s.settle();assert.equal(s.calls.at(-1).unreadOnly,true)
})
test('mobile mark all acknowledges on success and retains unread state on failure',async()=>{
 for(const failMark of [false,true]){const s=screen({events,failMark});await s.settle();await s.find('TouchableOpacity',p=>p.accessibilityLabel==='Mark all notifications read').props.onPress();await s.settle();assert.match(s.text(),failMark?/Could not mark/:/Unread \(0\)/)}
})
test('mobile load failure shows retry feedback and retains pull-to-refresh',async()=>{
 const s=screen({failLoad:true});await s.settle();assert.match(s.text(),/Could not load/);assert.ok(s.find('SectionList').props.refreshControl)
})
test('device-local grouping handles NZ midnight and DST without changing newest-first order',()=>{
 const now=new Date('2026-11-23T11:10:00Z'),then='2026-11-23T10:50:00Z'
 assert.equal(groups.dayGroupLabel(then,now,'Pacific/Auckland'),'Yesterday');assert.equal(groups.dayGroupLabel(then,now,'America/Los_Angeles'),'Today')
 assert.equal(groups.dayGroupLabel('2026-09-26T11:30:00Z',new Date('2026-09-27T10:30:00Z'),'Pacific/Auckland'),'Yesterday')
 assert.deepEqual(groups.groupByDay(events).flatMap(g=>g.items).map(n=>n.id),['one','two'])
})
test('known body templates are concise, NZD-formatted and preserve arbitrary details',()=>{
 assert.equal(notificationBody({type:'review_received',body:'Peter left you a 5★ review for "Fix trough".'}),"Peter gave you 5 stars for 'Fix trough'.")
 assert.equal(notificationBody({type:'job_completed',body:'Peter marked "Fix trough" complete. Leave a review of your experience.'}),"Peter completed 'Fix trough'. Leave a review.")
 assert.equal(notificationBody({type:'new_bid',body:'New offer of $3500.00 NZD on "Clean barn"'}),"New $3,500 offer for 'Clean barn'.")
 assert.equal(notificationBody({type:'new_message',body:'New message from Peter about "Fix trough"'}),"New message from Peter about 'Fix trough'.")
 const body='Peter confirmed "Fix trough": around 10am, bank transfer. Bring a ladder.';assert.equal(notificationBody({type:'job_confirmed',body}),body)
})
test('event routes and hints distinguish response opportunities from information',()=>{
 for(const type of ['new_question','question_answered'])assert.equal(notificationHref({type,metadata:{job_id:'j'}}),'/jobs/j#questions')
 assert.equal(notificationHref({type:'new_bid',metadata:{job_id:'j'}}),'/jobs/j#offer')
 assert.equal(notificationHref({type:'job_completed',metadata:{job_id:'j'}}),'/jobs/j#reviews')
 assert.equal(notificationHref({type:'review_received',metadata:{booking_id:'b'}}),'/bookings/b#reviews')
 assert.equal(notificationHint('new_message'),'Reply in chat');assert.equal(notificationHint('review_received'),null)
 for(const type of ['job_completed','booking_completed'])assert.equal(sideTag(type==='job_completed'?'job':'listing',{type}),type==='job_completed'?'JOB':'LISTING')
})

const native=readFileSync(new URL('../src/lib/notifications.js',import.meta.url),'utf8')
function api({rows=[],count=0,error=null}={}){
 const calls=[]
 const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'viewer'}}}})},from(table){const chain={};for(const method of ['select','eq','order','limit','update','lte'])chain[method]=(...args)=>{calls.push([table,method,...args]);return chain};chain.then=fn=>Promise.resolve({data:rows,count,error}).then(fn);return chain}}
 const start=native.indexOf('export async function fetchNotificationInbox'),end=native.indexOf('// Navigates to',start)
 const source=native.slice(start,end).replaceAll('export async function','async function')
 const functions=new Function('supabase','requestBadgeRefresh',source+';return {fetchNotificationInbox,markAllNotificationsRead}')(supabase,()=>calls.push(['badge']))
 return {...functions,calls}
}
test('inbox query scopes rows and full unread count to viewer, filters before limiting',async()=>{
 const db=api({rows:[events[0]],count:123}),result=await db.fetchNotificationInbox({unreadOnly:true,limit:1})
 assert.equal(result.unreadCount,123);assert.equal(result.items.length,1)
 assert.ok(db.calls.some(c=>c[1]==='select'&&c[3]?.head===true))
 assert.equal(db.calls.filter(c=>c[1]==='eq'&&c[2]==='user_id'&&c[3]==='viewer').length,2)
 assert.ok(db.calls.findIndex(c=>c[1]==='eq'&&c[2]==='read')<db.calls.findIndex(c=>c[1]==='limit'))
})
test('mark all read keeps ownership, unread condition and cutoff; query errors are surfaced',async()=>{
 const db=api();await db.markAllNotificationsRead('2026-11-24T00:00:00Z')
 for(const [method,key,value] of [['eq','user_id','viewer'],['eq','read',false],['lte','created_at','2026-11-24T00:00:00Z']])assert.ok(db.calls.some(c=>c[1]===method&&c[2]===key&&c[3]===value))
 await assert.rejects(api({error:Error('offline')}).fetchNotificationInbox(),/offline/)
 await assert.rejects(api({error:Error('denied')}).markAllNotificationsRead(),/denied/)
})
const openSource=native.slice(native.indexOf('export async function openNotificationTarget'),native.indexOf('export function notificationTimeAgo')).replace('export async function','async function')
test('mobile event navigation uses roles, focuses questions and handles missing/transient targets',async()=>{
 for(const [type,owner,result,expected] of [['new_question',true,{id:'j',requester_id:'viewer'},'JobDetail'],['question_answered',false,{id:'j',requester_id:'other'},'JobDetail'],['bid_accepted',false,{id:'j',requester_id:'other'},'JobDetail'],['job_completed',true,{id:'j',requester_id:'viewer'},'ManageTask'],['new_bid',true,null,null]]){
  const navigations=[],alerts=[],reads=[];const query={select(){return query},eq(){return query},maybeSingle:async()=>({data:result}),update(){reads.push(true);return query},then:fn=>Promise.resolve({}).then(fn)}
  const open=new Function('supabase','requestBadgeRefresh','Alert',openSource+';return openNotificationTarget')({from:()=>query},()=>{}, {alert:(...args)=>alerts.push(args)})
  assert.equal(await open({navigate:(...args)=>navigations.push(args)},'viewer',{id:'n',type,metadata:{job_id:'j'}}),true)
  assert.equal(navigations[0]?.[0]||null,expected)
  if(type==='new_question'||type==='question_answered')assert.equal(navigations[0][1].focusQuestions,true)
  if(!result)assert.equal(alerts.length,1)
 }
 const q={select(){return q},eq(){return q},maybeSingle:async()=>({error:Error('offline')})}
 const open=new Function('supabase','requestBadgeRefresh','Alert',openSource+';return openNotificationTarget')({from:()=>q},()=>{}, {alert(){}})
 assert.equal(await open({navigate(){throw Error('Must not navigate')}},'viewer',{id:'n',type:'new_bid',metadata:{job_id:'j'}}),false)
})
test('compact mobile rows retain complete long text and accessibility scaling',async()=>{
 const text='A very long job title '.repeat(20),s=screen({events:[{...events[0],body:text}]});await s.settle()
 const row=s.find('SectionList').props.renderItem({item:{...events[0],body:text}})
 assert.equal(row.props.accessibilityLabel,text)
 const children=row.props.children[1].props.children
 const body=children.find(n=>n?.type==='Text'&&n.props.children===text)
 assert.ok(body);assert.equal(body.props.numberOfLines,undefined);assert.equal(body.props.allowFontScaling,undefined)
})
