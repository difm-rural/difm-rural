import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {homeAttentionSummary} from '../shared/homeSummary.ts'
import {HOME_MODES} from '../shared/homeMode.ts'

const home=readFileSync(new URL('../src/screens/tabs/HomeTabScreen.js',import.meta.url),'utf8')
const card=readFileSync(new URL('../src/components/SeasonalReminderCard.js',import.meta.url),'utf8')

test('Home keeps My Property / My Work and its destinations; intro is one short line',()=>{
 assert.deepEqual(HOME_MODES.map(mode=>mode.label),['My Property','My Work'])
 for(const route of ["navigate('PropertyNetwork')","navigate('Connections',{side:'locals'})","navigate('Jobs',{screen:'PostJob'","navigate('Browse',{screen:'BrowseMain'})",
  "navigate('Jobs',{screen:'JobsBoard'})","navigate('MyServices'","navigate('Connections',{side:'customers'})"])
  assert.ok(home.includes(route),route)
 assert.match(home,/Find local help and keep track of who looks after your property\./)
 // The empty work line no longer repeats the two buttons right under it.
 assert.equal(homeAttentionSummary([]).text,"You're all caught up.")
})

test('seasonal cards are shorter but keep their swipe width, dismiss target and two-line body',()=>{
 assert.match(card,/width: 264,/)
 assert.match(home,/snapToInterval=\{276\}/) // 264 + 12 gap
 assert.match(card,/visualWrap: \{ height: 84,/)
 assert.match(card,/width: 44, height: 44,/)
 assert.match(card,/numberOfLines=\{2\}>\{campaign\.body\}/)
})
