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

test('My People cards say what each provider advertises, never their long skills list',async()=>{
 const {shortList,providerServiceSummary,loadAdvertisedServices}=await import('../shared/trustedLocals.ts')
 assert.equal(shortList(['Fencing','Water','Fencing','',null,'Trees']),'Fencing · Water +1 more')
 assert.equal(shortList(['Fencing']),'Fencing')
 assert.equal(shortList([]),'')
 assert.equal(shortList(null),'')
 assert.equal(providerServiceSummary({services:['Fencing & Gates','Water & Drainage','Machinery & Repairs','Transport & Delivery']}),'Fencing & Gates · Water & Drainage +2 more')
 // The profile's skills list (often dozens of capabilities) is never used: that was the "+58 more".
 const skills=Array.from({length:60},(_,i)=>'Skill '+i)
 assert.equal(providerServiceSummary({skills}),'')
 assert.equal(providerServiceSummary({services:[],skills}),'')
 // Advertised services: active listings only, most-listed category first, at most four.
 const filters=[]
 const listings=[
  {provider_id:'a',category:'Water & Drainage'},{provider_id:'a',category:'Fencing & Gates'},{provider_id:'a',category:'Fencing & Gates'},
  {provider_id:'a',category:null},{provider_id:'b',category:'Transport & Delivery'},
  ...['Land & Vegetation','Earthworks & Driveways','Buildings & Maintenance','General Rural Help'].map(category=>({provider_id:'b',category})),
 ]
 const query={eq(c,v){filters.push([c,v]);return query},is(c,v){filters.push([c,v]);return query},in(c,v){filters.push([c,v]);return query},
  order(){return query},range(){return Promise.resolve({data:listings,error:null})}}
 const client={from:table=>{assert.equal(table,'services_public');return {select:()=>query}}}
 const advertised=await loadAdvertisedServices(client,['a','b'])
 assert.deepEqual(advertised.get('a'),['Fencing & Gates','Water & Drainage'])
 assert.equal(advertised.get('b').length,4)
 assert.ok(filters.some(([c,v])=>c==='is_active'&&v===true))
 assert.ok(filters.some(([c,v])=>c==='closed_at'&&v===null))
 assert.equal((await loadAdvertisedServices(client,[])).size,0)
 const {readFileSync}=await import('node:fs')
 const screen=readFileSync(new URL('../src/screens/ConnectionsScreen.js',import.meta.url),'utf8')
 // Badges, counts, services, invite and the More menu stay; the per-job "Recent work" line is gone
 // (Work history in the More menu still has it). People you've only worked with get their services too.
 for(const text of ['>Saved<','>Worked together<','Offers: {services}','completedWorkLabel(work)','Invite to job',"label:'Work history'",'loadAdvertisedServices(supabase,ids)'])
  assert.ok(screen.includes(text),text)
 assert.doesNotMatch(screen,/Recent work:/)
 assert.match(screen,/Save provider/)
})
