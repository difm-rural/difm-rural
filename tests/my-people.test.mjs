import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {mergeMyPeople,completedWorkLabel} from '../shared/trustedLocals.ts'

const ana={id:'a',full_name:'Ana',display_name:null,avatar_url:null,region:'Waitoki',skills:null,services:['Fencing & Gates']}
const ben={id:'b',full_name:'Ben',display_name:null,avatar_url:null,region:null,skills:null}
const work=(person,extra={})=>({personId:person.id,person,times_worked:2,jobs_count:2,bookings_count:0,last_engaged_at:'2026-10-01T00:00:00Z',categories:['Fencing & Gates'],...extra})

test('a provider who is saved and worked together appears once with both relationships',()=>{
 const people=mergeMyPeople([ana],[work(ana),work(ben,{jobs_count:1,bookings_count:1})])
 assert.deepEqual(people.map(p=>[p.id,p.saved,!!p.work]),[['a',true,true],['b',false,true]])
 assert.deepEqual(people[0].person.services,['Fencing & Gates'])
 assert.equal(mergeMyPeople([ana,ana],[work(ana),work(ana)]).length,1)
 assert.deepEqual(mergeMyPeople([],[{personId:'x',person:null}]),[])
})

test('completed work is counted by jobs and bookings',()=>{
 assert.equal(completedWorkLabel(work(ana)),'2 jobs completed')
 assert.equal(completedWorkLabel({jobs_count:1,bookings_count:1}),'1 job and 1 booking completed')
 assert.equal(completedWorkLabel({jobs_count:0,bookings_count:0,times_worked:3}),'3 jobs completed')
 assert.equal(completedWorkLabel(null),'')
})

test('My People keeps Invite to job visible and moves secondary actions into a menu',()=>{
 const screen=readFileSync(new URL('../src/screens/ConnectionsScreen.js',import.meta.url),'utf8')
 assert.match(screen,/mergeMyPeople\(saved, connections\)/)
 assert.match(screen,/>Invite to job</)
 for(const label of ['Remove from saved','Share profile','Copy link','Work history'])assert.match(screen,new RegExp(label))
 assert.match(screen,/<LocalMoreMenu/)
 assert.match(screen,/onPress=\{\(\)=>openProfile\(person\)\}/)
 assert.doesNotMatch(screen.slice(screen.indexOf('function renderPerson'),screen.indexOf('const localHeader')),/numberOfLines/)
})
