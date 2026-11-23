import test from 'node:test'
import assert from 'node:assert/strict'
import {HELP_FILTERS,matchesHelpFilter,matchesListingSearch,readableRate,bookingSubmission,quantityUnit} from '../shared/findLocalHelp.ts'
import {listingEstimate} from '../shared/listingEstimate.ts'
import {bookingNextMove} from '../shared/nextMove.ts'
import {openBooking} from './support/booking-confirm-screen.mjs'
const service={id:'listing',provider_id:'provider',kind:'grazing',title:'Grazing with water',pricing_type:'per_unit',rate:50,unit_label:'head/week',minimum_units:2,max_units:10,location_name:'PRIVATE STREET ADDRESS',latitude:-41.12345,longitude:174.12345,profile:{full_name:'Peter'}}
test('one marketplace filters existing kinds and legacy categories without modifying stored values',()=>{
 assert.deepEqual(HELP_FILTERS.map(f=>f[1]),['All','Services','Grazing','Equipment','Goods'])
 for(const [kind,filter] of [['service','service'],['grazing','grazing'],['hire','hire'],['for_sale','for_sale']]){assert.ok(matchesHelpFilter({kind},''));assert.ok(matchesHelpFilter({kind},filter));assert.ok(!matchesHelpFilter({kind},filter==='hire'?'service':'hire'))}
 assert.ok(matchesHelpFilter({kind:'lease',category:'Paddock/land'},'grazing'));assert.ok(matchesHelpFilter({kind:'lease',category:'Storage'},'service'));assert.ok(matchesHelpFilter({category:'Grazing'},'grazing'));assert.ok(matchesHelpFilter({category:'Machinery'},'hire'));assert.ok(matchesHelpFilter({category:'Water & Drainage'},'service'))
 assert.ok(matchesListingSearch(service,'  GRAZING '));assert.ok(!matchesListingSearch(service,'fencing'))
})
test('grazing unit price and calculator quantity/capacity retain existing estimate rules',()=>{
 assert.equal(readableRate('per_unit',50,'head/week'),'$50 per head per week');assert.equal(quantityUnit('head/week',7),'head');assert.equal(quantityUnit('head/month',1),'head')
 assert.equal(listingEstimate(service,null,7).baseAmount,350);assert.equal(listingEstimate(service,null,100).quantity,10)
})
const located=options=>{const screen=openBooking({service,quantity:7,...options});screen.find('AddressAutocomplete').props.onChangeText('Agreed grazing area');screen.render();return screen}
test('request preserves quantity and never copies a private provider address or pin',async()=>{
 const s=located();assert.ok(!s.texts().includes('PRIVATE STREET ADDRESS'));await s.press('Send booking request')
 const row=s.log.writes[0].payload;assert.equal(row.quantity,7);assert.equal(row.total_amount,350);assert.equal(row.location_name,'Agreed grazing area');assert.equal(row.latitude,null);assert.equal(row.longitude,null)
 assert.ok(s.texts().includes('Booking request sent!'));assert.ok(s.texts().includes('Peter'))
 await s.press('View booking');assert.equal(s.log.navigation[0][0],'ServiceBookingDetail');assert.equal(s.log.navigation[0][1].booking.id,row.id);assert.equal(s.log.navigation[0][1].viewerRole,'requester')
})
test('double taps create one request; success prevents repeat submission and Back to listings only navigates',async()=>{
 const s=located();const button=s.find('Button',p=>p.title==='Send booking request');await Promise.all([button.props.onPress(),button.props.onPress()]);assert.equal(s.log.writes.length,1);await s.press('Back to listings');assert.equal(s.log.writes.length,1);assert.equal(s.log.navigation[0].routes[0].name,'BrowseMain')
})
test('failed booking remains editable; retry uses the same ID and success navigation follows verified record',async()=>{
 const s=located({fail:true});await s.press('Send booking request');assert.ok(!s.texts().includes('Booking request sent!'));assert.equal(s.log.navigation.length,0);await s.press('Send booking request');assert.equal(s.log.writes.length,2);assert.equal(s.log.writes[0].payload.id,s.log.writes[1].payload.id);assert.equal(s.log.writes[1].options.ignoreDuplicates,true)
})
test('leaving without submission creates no request; duration uses optional notes only',async()=>{
 const s=located();assert.equal(s.log.writes.length,0);s.find('TextInput',p=>p.accessibilityLabel==='Expected duration').props.onChangeText('6 weeks');await s.press('Send booking request');assert.equal(s.log.writes[0].payload.notes,'Expected duration: 6 weeks');assert.ok(!('duration' in s.log.writes[0].payload))
})
test('role-specific pending copy is clear and completion/cancellation lifecycle remains distinct',()=>{
 const b={status:'pending',service};assert.equal(bookingNextMove(b,'requester',{otherName:'Peter Provider'}).badge,'Waiting for Peter to accept');assert.ok(!bookingNextMove(b,'requester').needsAction);assert.ok(bookingNextMove(b,'provider').needsAction);assert.equal(bookingNextMove({...b,status:'completed'},'requester'),null)
 const lock=bookingSubmission();assert.ok(lock.start());assert.ok(!lock.start());lock.finish(false);assert.ok(lock.start());lock.finish(true);assert.ok(!lock.start())
})

import {activityCard,nodes,flattenStyle} from './support/activity-card.mjs'
import {filterNearby} from '../src/lib/nearbyBrowsing.js'
test('requester Activity card fills available width and allows names, status, price and title to wrap',()=>{
 let opened=0;const card=activityCard(true,()=>opened++);assert.equal(flattenStyle(card.props.style).width,'100%');card.props.onPress();assert.equal(opened,1)
 const all=nodes(card),text=all.filter(n=>n.type==='Text')
 for(const content of ['Peter Provider Longname','Waiting for Peter to accept','Long grazing listing for winter animals']){const node=text.find(n=>n.props.children===content);assert.ok(node,content);assert.equal(node.props.numberOfLines,undefined)}
 assert.ok(all.some(n=>n.type==='ThumbImage'&&flattenStyle(n.props.style).width==='100%'));assert.ok(all.some(n=>n.type==='View'&&flattenStyle(n.props.style).maxWidth==='95%'))
 assert.equal(flattenStyle(activityCard(false,()=>{}).props.style).width,155,'existing provider carousel width preserved')
})
test('kind and search filtering compose with unchanged distance filtering and All New Zealand',()=>{
 const origin={latitude:-41.1,longitude:174.1},items=[{id:'near',kind:'grazing',title:'Winter grazing',discovery_latitude:-41.1,discovery_longitude:174.1},{id:'far',kind:'grazing',title:'Winter grazing',discovery_latitude:-43,discovery_longitude:172},{id:'missing',kind:'grazing',title:'Winter grazing'},{id:'service',kind:'service',title:'Mowing',latitude:-41.1,longitude:174.1}]
 const filtered=items.filter(i=>matchesHelpFilter(i,'grazing')&&matchesListingSearch(i,'winter'))
 assert.deepEqual(filterNearby(filtered,{point:origin,radius:25}).items.map(i=>i.id),['near'])
 assert.equal(filterNearby(filtered,{point:origin,radius:null}).items.length,3)
})
import {readFileSync} from 'node:fs'
const navigatorSource=readFileSync(new URL('../src/navigation/AppNavigator.js',import.meta.url),'utf8')
const pendingSource=navigatorSource.slice(navigatorSource.indexOf('  async function postPendingBookingIfAny('),navigatorSource.indexOf('  function handleOnboardingComplete'))
test('guest booking resumption supports legacy drafts, guards concurrent sign-in events and confirms the saved record',async()=>{
 let saved=JSON.stringify({service_id:'listing',provider_id:'provider',quantity:7,total_amount:350}),created,posts=[],success=[],alerts=[]
 const storage={getItem:async()=>saved,setItem:async(k,v)=>{saved=v},removeItem:async()=>{saved=null}}
 const resume=new Function('AsyncStorage','newJobId','supabase','fetchBookingDetail','setBookingSuccessResult','Alert','pendingBookingPostingRef','return ('+pendingSource+')')(storage,()=> 'known-uuid',{from:()=>({upsert:async row=>{posts.push(row);created=row;return {error:null}}})},async(c,id)=>({...created,id}),row=>success.push(row),{alert:(...a)=>alerts.push(a)},{current:false})
 await Promise.all([resume('requester'),resume('requester')]);assert.equal(posts.length,1);assert.equal(success[0].id,'known-uuid');assert.equal(saved,null);assert.equal(alerts.length,0)
})
test('failed guest submission retains a stable draft ID and never reports success',async()=>{
 let saved=JSON.stringify({booking:{service_id:'listing'}}),success=false
 const storage={getItem:async()=>saved,setItem:async(k,v)=>{saved=v},removeItem:async()=>{saved=null}}
 const resume=new Function('AsyncStorage','newJobId','supabase','fetchBookingDetail','setBookingSuccessResult','Alert','pendingBookingPostingRef','return ('+pendingSource+')')(storage,()=> 'retry-uuid',{from:()=>({upsert:async()=>({error:{message:'offline'}})})},async()=>{throw Error('Should not load success')},()=>{success=true},{alert(){}},{current:false})
 await resume('requester');await resume('requester');assert.equal(JSON.parse(saved).booking.id,'retry-uuid');assert.equal(success,false)
})
