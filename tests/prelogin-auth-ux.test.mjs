import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {parseGuestIntent,saveGuestIntent,guestIntentDestination,GUEST_INTENT_KEY} from '../src/lib/guestIntent.js'
import {safeReturnPath} from '../provider-web/src/lib/return-path.ts'
import {signInMethodHint,isPasswordAccount} from '../shared/reviewAccount.ts'
import {canResumeGuestAction} from '../src/lib/listingEnquiry.js'
import {openWizard} from './support/post-job-wizard.mjs'
import {openBooking} from './support/booking-confirm-screen.mjs'
const require=createRequire(import.meta.url),id='12345678-1234-1234-1234-123456789abc',now=10000000
const raw=(action='booking',extra={})=>JSON.stringify({action,id,savedAt:now,...extra})
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')

test('guest return destinations reject expired, future, arbitrary and malformed intents',()=>{
 for(const value of ['bad',raw('https://evil.invalid'),raw('Chat'),raw('booking',{id:'//evil.invalid'}),raw('booking',{savedAt:now+1}),raw('booking',{savedAt:now-3600000})])assert.equal(parseGuestIntent(value,now),null)
 assert.equal(parseGuestIntent(raw(),now).id,id)
 assert.deepEqual(parseGuestIntent(raw('booking',{privateAddress:'private',token:'secret'}),now),{action:'booking',id,savedAt:now})
})
test('guest intent stores public context only and supersedes an older action',async()=>{
 const store=new Map([['pendingJobView','old'],['pendingListingEnquiry','old']])
 const storage={multiRemove:async keys=>keys.forEach(k=>store.delete(k)),setItem:async(k,v)=>store.set(k,v)}
 await saveGuestIntent(storage,'booking',id)
 assert.deepEqual([...store.keys()],[GUEST_INTENT_KEY])
 assert.equal(parseGuestIntent(store.get(GUEST_INTENT_KEY)).id,id)
 await assert.rejects(saveGuestIntent(storage,'Chat',id))
})
test('post and listing creation return to existing forms without touching the backend',async()=>{
 const client=new Proxy({},{get(){throw Error('No backend calls permitted')}})
 assert.deepEqual(await guestIntentDestination(client,{action:'post-job'}),['Home',{screen:'PostJob',params:{resumeGuestDraft:true}}])
 assert.deepEqual(await guestIntentDestination(client,{action:'create-listing'}),['Browse',{screen:'CreateService'}])
})
test('booking and job handoffs reload only approved public views, never submit or trust saved rows',async()=>{
 for(const action of ['booking','listing','job']){
  const reads=[],row={id,title:'Public item',is_active:true}
  const client={from:table=>{reads.push(table);return {select:fields=>{assert.equal(fields,'*');return {eq:(key,value)=>{assert.equal(key,'id');assert.equal(value,id);return {maybeSingle:async()=>({data:row,error:null})}}}}}}}
  const destination=await guestIntentDestination(client,{action,id})
  assert.deepEqual(reads,[action==='job'?'jobs_public':'services_public'])
  assert.equal(destination[1].screen,action==='job'?'JobDetail':action==='booking'?'BookingConfirm':'ServiceDetail')
  assert.deepEqual(destination[1].params,action==='job'?{job:row}:{service:row})
 }
})
test('withdrawn listings return to details, missing records and lookup failures are safe',async()=>{
 const client=(data,error=null)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data,error})})})})})
 assert.equal((await guestIntentDestination(client({id,is_active:false}),{action:'booking',id}))[1].screen,'ServiceDetail')
 assert.equal(await guestIntentDestination(client(null),{action:'job',id}),null)
 await assert.rejects(guestIntentDestination(client(null,Error('offline')),{action:'job',id}),/offline/)
})
test('web return navigation rejects external URLs, encoded delimiters and authentication loops',()=>{
 for(const path of ['https://evil.invalid','//evil.invalid','/\\evil','/%5cevil','/%2fevil','/auth/callback','/AUTH/callback','/%61uth/callback','/a/../login','/%zz'])assert.equal(safeReturnPath(path),'/',path)
 for(const path of ['/jobs/new','/listings/new','/jobs/'+id+'#offer','/browse/'+id+'/request'])assert.equal(safeReturnPath(path),path)
})
test('email-first registration and password exceptions retain their existing methods',()=>{
 assert.equal(signInMethodHint(''),'')
 assert.match(signInMethodHint('new@example.invalid'),/sign-in code/)
 assert.equal(isPasswordAccount('review@ruralconnections.nz'),true)
 assert.match(signInMethodHint('review@ruralconnections.nz'),/password/)
})
test('resume still waits for matching authenticated profile and onboarding',()=>{
 const session={user:{id:'owner'}}
 assert.equal(canResumeGuestAction(session,{id:'other'},false,false),false)
 assert.equal(canResumeGuestAction(null,{id:'owner'},false,false),false)
 assert.equal(canResumeGuestAction(session,{id:'owner'},false,true),false)
 assert.equal(canResumeGuestAction(session,{id:'owner'},false,false),true)
})
test('cancelling mobile login clears return intent; auth events cannot write jobs or bookings',()=>{
 const login=source('src/screens/LoginScreen.js'),nav=source('src/navigation/AppNavigator.js')
 assert.match(login,/addListener\('beforeRemove'/)
 assert.match(login,/if \(!verified.current\) AsyncStorage.multiRemove\(\[GUEST_INTENT_KEY/)
 assert.doesNotMatch(nav,/postPending(Job|Booking)IfAny|\.insert\(|\.upsert\(/)
 assert.match(source('src/screens/postjob/PostJobStep1JobType.js'),/navigation.navigate\('PostJobStep5Review'\)/)
})
test('fresh guest job draft returns to review with its dates and details and creates no job',async()=>{
 const draft={title:'Repair trough',description:'Repair the water trough',scheduleType:'specific',scheduledDate:'2099-01-20',priceType:'open',draftJobId:id}
 const wizard=await openWizard({params:{resumeGuestDraft:true},savedDraft:{_savedAt:Date.now(),_draft:draft}})
 assert.equal(wizard.step(),'PostJobStep5Review')
 assert.equal(wizard.context().jobData.title,draft.title)
 assert.equal(wizard.context().jobData.description,draft.description)
 assert.equal(wizard.context().jobData.scheduledDate,draft.scheduledDate)
 assert.equal(wizard.log.inserts.length,0);assert.equal(wizard.log.links.length,0)
 assert.equal(wizard.log.local.has('pendingJob'),false)
})
test('expired guest draft stays at the safe starting point and is never submitted or discarded',async()=>{
 const wizard=await openWizard({params:{resumeGuestDraft:true},savedDraft:{_savedAt:Date.now()-3600001,_draft:{title:'Old draft'}}})
 assert.equal(wizard.step(),'PostJob');assert.equal(wizard.log.inserts.length,0)
 assert.equal(wizard.log.local.has('pendingJob'),true)
})
test('guest booking authentication saves only the listing ID and returns to login without a request',async()=>{
 const service={id,provider_id:'provider',kind:'grazing',title:'Grazing',pricing_type:'per_unit',rate:10,unit_label:'head/week',payment_timing:'on_completion'}
 const screen=openBooking({service,user:null})
 await screen.press('Send booking request')
 assert.equal(screen.log.writes.length,0)
 const sheet=screen.all().find(n=>typeof n.type==='function'&&n.type.name==='AuthSheet')
 assert.ok(sheet);await sheet.props.onLogin()
 assert.equal(screen.log.writes.length,0)
 assert.equal(parseGuestIntent(screen.log.local.get(GUEST_INTENT_KEY)).id,id)
 assert.deepEqual(screen.log.navigation.at(-1),['Login',{intent:'login'}])
})

function landing(){
 const code=require('@babel/core').transformSync(source('src/screens/LandingScreen.js'),{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
 const jsx=(type,props)=>({type,props}),exports={},calls=[]
 const react={useState:v=>[typeof v==='function'?v():v,()=>{}],useEffect(){},useRef:v=>({current:v})};react.default=react
 new Function('exports','require',code)(exports,name=>{
  if(name==='react')return {...react,__esModule:true}
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'}
  if(name==='react-native')return {...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','FlatList','RefreshControl'].map(n=>[n,n])),StyleSheet:{create:v=>v},Alert:{alert(){}}}
  if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:0,bottom:0})}
  if(name.endsWith('/useNearbyBrowsing'))return {__esModule:true,default:()=>({})}
  if(name.endsWith('/nearbyBrowsing'))return {filterNearby:items=>({items,unlocated:0})}
  if(name.endsWith('/tokens'))return {colors:{}}
  return {__esModule:true,default:name.split('/').at(-1)}
 })
 const tree=exports.default({navigation:{navigate:(...v)=>calls.push(v)}})
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
 return {nodes:nodes(tree),calls}
}
test('mobile Home renders balanced help/work cards with existing public routes and one search',()=>{
 const {nodes,calls}=landing(),cards=nodes.filter(n=>n.props?.accessibilityLabel?.includes('. Browse'))
 assert.equal(cards.length,2);assert.deepEqual(cards[0].props.style,cards[1].props.style)
 assert.equal(cards[0].props.style.flex,1);assert.equal(cards[0].props.style.minWidth,0)
 cards.forEach(n=>n.props.onPress());assert.deepEqual(calls,[['ServicesList'],['GuestJobFeed']])
 const inputs=nodes.filter(n=>n.type==='TextInput');assert.equal(inputs.length,1);assert.equal(inputs[0].props.placeholder,'Search jobs, services and equipment...')
 assert.ok(nodes.some(n=>n.type==='Text'&&n.props.children==='Get jobs done. Find work.'))
})
test('public Home retains approved discovery, guest details and location functionality',()=>{
 const home=source('public-web/src/app/page.tsx')
 for(const text of ['Get jobs done. Find work.','Find services and people to help.','Find jobs posted near you.','href="/listings"','href="/jobs"','<NearbyControls','publicRows(publicClient(),\'jobs\'','publicRows(publicClient(),\'listings\''])assert.ok(home.includes(text),text)
 assert.match(source('src/screens/LandingScreen.js'),/navigation.navigate\('GuestJobDetail'/)
 assert.match(source('src/screens/LandingScreen.js'),/navigation.navigate\('ServiceDetail'/)
 assert.doesNotMatch(source('src/screens/LandingScreen.js'),/requestForegroundPermissionsAsync|getCurrentPosition/)
})
