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
 assert.deepEqual(HOME_MODES.map(mode=>[mode.heading,mode.subtitle]),[
  ['What needs doing?','Post a job or find local help for your place.'],
  ['What can you offer?','Find local work or let people know what you do.'],
 ])
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

test('My Property empty state agrees with the "things you need help with" line',async()=>{
 const {homePropertyEmpty}=await import('../shared/homeSummary.ts')
 assert.deepEqual(homePropertyEmpty(0),{title:'No active work yet',body:'Post a job or find local help to get started.'})
 assert.deepEqual(homePropertyEmpty(1),{title:'No jobs posted yet',body:'Post a job for the 1 thing you need help with, or find local help.'})
 assert.equal(homePropertyEmpty(2).body,'Post a job for the 2 things you need help with, or find local help.')
 // Both read the same count.
 for(const file of ['src/screens/tabs/HomeTabScreen.js','provider-web/src/app/page.tsx'])
  assert.match(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/homePropertyEmpty\(propertyNetworkHelpCount\(network\)\)/)
})
