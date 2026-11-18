import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {HOME_MODES,homeMode,homeModeKey,homeRole} from '../shared/homeMode.ts'
import {homeCustomerCount,homeNetworkSummary,homeUpcoming,homeWorkFocus,homeWorkSummary} from '../shared/homeSummary.ts'

test('network preview reports real gap names, omits unconfigured gaps and caps named areas',()=>{
 const area=(label,needsHelp=false,linkedCount=0,configured=needsHelp)=>({label,needsHelp,linkedCount,configured})
 assert.deepEqual(homeNetworkSummary([area('Water',true),area('Pasture & Land',true,1),area('Fencing'),area('Machinery',true)]),{
  counts:'1 area with providers · 3 areas need help',detail:'Water, Pasture & Land and 1 more need support.',
 })
 assert.match(homeNetworkSummary([area('Water')]).detail,/Start building/)
 assert.match(homeNetworkSummary([area('Water',false,1)]).detail,/No support gaps marked/)
 assert.equal(homeNetworkSummary([area('Water',true)]).detail,'Water needs support.')
})

test('Work filters empty metrics, prioritises actionable items and distinguishes failed reads',()=>{
 const empty={work:0,upcoming:0,offers:0,invitations:0}
 assert.deepEqual(homeWorkSummary(empty),{indicators:[],unavailable:false})
 assert.deepEqual(homeWorkSummary({...empty,upcoming:null}),{indicators:[],unavailable:true})
 const result=homeWorkSummary({work:4,upcoming:2,offers:1,invitations:3})
 assert.deepEqual(result.indicators.map(row=>row.id),['invitations','offers','upcoming','work'])
 assert.deepEqual(result.indicators.slice(1).map(row=>homeWorkFocus(new URL(row.href,'https://example.com').searchParams.get('focus'))),['offers','upcoming','work'])
 assert.equal(homeWorkFocus('history'),null)
 assert.equal(homeUpcoming('scheduled','job','2026-11-18T07:00:00Z',Date.parse('2026-11-18T08:00:00Z')),false)
 assert.equal(homeUpcoming('scheduled','job','2026-11-18T09:00:00Z',Date.parse('2026-11-18T08:00:00Z')),true)
})

test('customer count uses the member-scoped completed relationship view and returns counts only',async()=>{
 const calls=[]
 const db={from(table){calls.push(table);return {select(field,options){calls.push([field,options]);return {
  eq(key,value){calls.push([key,value]);return this},
  neq(key,value){calls.push([key,value]);return Promise.resolve({count:3,error:null})},
 }}}}}
 assert.equal(await homeCustomerCount(db,'viewer'),3)
 assert.deepEqual(calls,['connections',['requester_id',{head:true,count:'exact'}],['provider_id','viewer'],['requester_id','viewer']])
 assert.equal(await homeCustomerCount({},'viewer'),null)
})

test('Home defaults to Property, restores Work and separates transaction directions',()=>{
 assert.equal(homeMode(null),'property')
 assert.equal(homeMode('unknown'),'property')
 assert.equal(homeMode('work'),'work')
 assert.notEqual(homeModeKey('one'),homeModeKey('two'))
 assert.deepEqual(HOME_MODES.map(mode=>homeRole(mode.id)),['requester','provider'])
})

test('web changes both panels immediately and remembers the selected mode for that viewer',()=>{
 const require=createRequire(import.meta.url)
 const ts=require('typescript'),exports={}
 const source=readFileSync(new URL('../provider-web/src/components/home-modes.tsx',import.meta.url),'utf8')
 const script=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const storage=new Map([[homeModeKey('one'),'work']])
 let mode,effect
 const node=(type,props)=>({type,props})
 const imports={
  'react/jsx-runtime':{jsx:node,jsxs:node,Fragment:'fragment'},
  react:{useEffect:fn=>{effect=fn},useState:initial=>[mode??initial,value=>{mode=value}]},
  '@shared/homeMode':{HOME_MODES,homeMode,homeModeKey},
 }
 runInNewContext(script,{exports,require:name=>imports[name],localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}})
 const render=owner=>exports.HomeModes({owner,property:'property panel',work:'work panel'})
 const panels=view=>view.props.children.slice(1).map(panel=>panel.props.hidden)
 assert.deepEqual([...panels(render('one'))],[false,true])
 effect()
 const restored=render('one')
 assert.deepEqual([...panels(restored)],[true,false])
 const buttons=restored.props.children[0].props.children[0].props.children
 buttons[0].props.onClick()
 assert.deepEqual([...panels(render('one'))],[false,true])
 assert.equal(storage.get(homeModeKey('one')),'property')
 assert.equal(storage.has(homeModeKey('two')),false)
})

test('native Home keeps modes role-independent and the requester relationship route is retained',()=>{
 const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8')
 const native=read('src/screens/tabs/HomeTabScreen.js')
 assert.match(native,/AsyncStorage\.setItem\(homeModeKey\(userId\)/)
 assert.match(native,/HOME_MODES\.map/)
 assert.match(native,/navigate\('PropertyNetwork'\)/)
 assert.match(native,/side:'customers'/)
 assert.match(native,/Useful right now/)
 assert.doesNotMatch(native,/canProvide|My Locals/)
 const network=read('provider-web/src/app/property-network/property-network.tsx')
 assert.match(network,/href="\/connections\?view=locals">My People/)
 assert.match(network,/Map-based property setup is coming/)
})
