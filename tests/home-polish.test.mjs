import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {homeAttentionSummary} from '../shared/homeSummary.ts'
import {HOME_MODES} from '../shared/homeMode.ts'

const home=readFileSync(new URL('../src/screens/tabs/HomeTabScreen.js',import.meta.url),'utf8')
const card=readFileSync(new URL('../src/components/SeasonalReminderCard.js',import.meta.url),'utf8')

test('Home keeps My Property / My Work and its destinations; intro is one short line',()=>{
 assert.deepEqual(HOME_MODES.map(mode=>mode.label),['My Property','My Work'])
 // Each tab leads with the task, not a tagline.
 assert.deepEqual(HOME_MODES.map(mode=>mode.heading),['What needs doing?','What can you offer?'])
 assert.ok(HOME_MODES.every(mode=>!('subtitle' in mode)))
 // My People is reached from My Network now, not a separate Home link.
 assert.ok(!home.includes(">My People<"));assert.ok(!home.includes("All notifications"))
 for(const route of ["navigate('PropertyNetwork')","navigate('Jobs',{screen:'PostJob'","navigate('Browse',{screen:'BrowseMain'})",
  "navigate('Jobs',{screen:'JobsBoard'})","navigate('MyServices'","navigate('Connections',{side:'customers'})"])
  assert.ok(home.includes(route),route)
 // The empty work line no longer repeats the two buttons right under it.
 assert.equal(homeAttentionSummary([]).text,"You're all caught up.")
 // Never "all caught up" beside an unread bell.
 assert.equal(homeAttentionSummary([],0,35).text,'Nothing needs your action. 35 unread updates in Notifications.')
 assert.equal(homeAttentionSummary([],0,1).text,'Nothing needs your action. 1 unread update in Notifications.')
})

test('seasonal cards are shorter but keep their swipe width, dismiss target and two-line body',()=>{
 assert.match(card,/width: 264,/)
 assert.match(home,/snapToInterval=\{276\}/) // 264 + 12 gap
 assert.match(card,/visualWrap: \{ height: 84,/)
 assert.match(card,/width: 44, height: 44,/)
 assert.match(card,/numberOfLines=\{2\}>\{campaign\.body\}/)
})

test('My Property compact Home: one-line items, priority order, no empty state',async()=>{
 const c=await import('../shared/homeCompact.ts')
 // Lines
 assert.equal(c.attentionLine('Paint fence',{detail:'Review and choose from 2 offers',badge:'Waiting on you to choose'}),'2 offers on Paint fence')
 assert.equal(c.attentionLine('Paint fence',{detail:'Review and choose an offer',badge:'Waiting on you to choose'}),'1 offer on Paint fence')
 assert.equal(c.attentionLine('Gate',{detail:'Answer 3 provider questions',badge:'Waiting on you to answer'}),'3 questions on Gate')
 assert.equal(c.attentionLine('Tank',{detail:'Review and accept the quote',badge:'Waiting on you to respond'}),'Quote to review · Tank')
 assert.equal(c.attentionLine('Barn',{detail:'Leave a review for Pat',badge:'Waiting on you to review'}),'Barn · leave a review')
 assert.equal(c.goLine('Paint fence',{label:'Waiting for offers',badge:'Waiting for offers',tone:'muted'}),'Paint fence · waiting for offers')
 assert.match(c.goLine('Gate repair',{label:'Scheduled for Tuesday',badge:'Waiting on Pat to complete',tone:'scheduled'},'2026-12-03T00:00:00Z'),/^Gate repair · booked \w{3} 3 Dec/)
 assert.equal(c.goLine('Barn',{label:'Job confirmed',badge:'Waiting on Pat to complete',tone:'waiting'}),'Barn · waiting on Pat to complete')
 // Priority: waiting on you → need not posted → review; newest first within each; max 3 + more
 const ranked=c.rankAttention([
  {id:'r',group:'review',updatedAt:'2026-11-27'},{id:'n',group:'need'},
  {id:'w1',group:'waiting',updatedAt:'2026-11-01'},{id:'w2',group:'waiting',updatedAt:'2026-11-20'},
 ])
 assert.deepEqual(ranked.shown.map(i=>i.id),['w2','w1','n']);assert.equal(ranked.more,1)
 assert.equal(c.rankAttention([]).total,0)
 // Network row pluralises
 assert.equal(c.propertyNetworkRow(1),'My Property Network · 1 person')
 assert.equal(c.propertyNetworkRow(0),'My Property Network · 0 people')
 // The empty-state block is gone from both Home screens; subtitles too.
 for(const file of ['src/screens/tabs/HomeTabScreen.js','provider-web/src/app/page.tsx']){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8')
  assert.doesNotMatch(source,/No jobs posted yet|No active work yet|homePropertyEmpty/)
  assert.doesNotMatch(source,/HOME_MODES[^\n]*\.subtitle/)
 }
})

test('a need is "not posted yet" until its area has an open or accepted linked job',async()=>{
 const c=await import('../shared/homeCompact.ts')
 const network={preferences:[{area:'fencing',active:true},{area:'water',active:true}],links:[],people:[],contactLinks:[],contacts:[],
  services:[{area:'fencing',service_key:'custom-1',name:'Gates',status:'needs_help'},{area:'fencing',service_key:'custom-2',name:'Boundary fence',status:'needs_help'},
   {area:'water',service_key:'custom-3',name:'Trough',status:'needs_help'},{area:'water',service_key:'custom-4',name:'Tank',status:'sorted'}]}
 const names=list=>list.map(n=>n.service.name).sort()
 assert.deepEqual(names(c.unpostedNeeds(network,[],[])),['Boundary fence','Gates','Trough'])
 assert.equal(c.unpostedNeeds(network,[],[]).find(n=>n.service.name==='Gates').text,'Gates · not posted yet')
 // An open job linked to the fencing AREA hides both fencing needs (known area-level limitation).
 const jobs=[{id:'j1',requester_id:'me',title:'Gates',status:'open',category:'Fencing & Gates',created_at:'2026-11-27'}]
 assert.deepEqual(names(c.unpostedNeeds(network,jobs,[{area:'fencing',job_id:'j1'}])),['Trough'])
 // A completed linked job doesn't count as covering the need.
 assert.deepEqual(names(c.unpostedNeeds(network,[{...jobs[0],status:'completed'}],[{area:'fencing',job_id:'j1'}])),['Boundary fence','Gates','Trough'])
 assert.deepEqual(c.unpostedNeeds(null),[])
})
