import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as model from '../shared/propertyNetworkJobs.ts'
import * as tokens from '../src/theme/tokens.js'
const require=createRequire(import.meta.url),code=require('@babel/core').transformSync(readFileSync(new URL('../src/components/PropertyAreaJobs.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code
const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)]
async function mount(fail=false){
 const jobs=[{id:'a',title:'Repair trough',status:'accepted',requester_id:'me',category:'Water & Drainage',created_at:'2026-11-20',provider:'Peter'},{id:'b',title:'Clean barn',status:'completed',requester_id:'me',category:'Buildings & Maintenance',created_at:'2026-10-20'}]
 let links=[{area:'water',job_id:'a'}],at=0,dirty=true,tree,effects=[];const slots=[],log={navigate:[],writes:[]}
 const react={createElement:(type,props,...children)=>typeof type==='function'?type({...props,children}):({type,props:{...props,children}}),useState:init=>{const i=at++;if(!(i in slots))slots[i]=init;return [slots[i],v=>{const value=typeof v==='function'?v(slots[i]):v;if(!Object.is(value,slots[i])){slots[i]=value;dirty=true}}]},useCallback:(fn,deps)=>{const i=at++,old=slots[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))slots[i]={fn,deps};return slots[i].fn}}
 const modules={react,'react-native':{Text:'Text',View:'View',TouchableOpacity:'TouchableOpacity'},'@react-navigation/native':{useFocusEffect(fn){const i=at++;if(slots[i]!==fn){slots[i]=fn;effects.push(fn)}}},'./LocalProviderActions':{LocalAction:'LocalAction'},'../lib/supabase':{supabase:{}},'../lib/lifecycle':{jobStatusLabel:s=>s},'../theme/tokens':tokens,'../../shared/propertyNetworkJobs':{...model,loadPropertyJobs:async()=>{if(fail)throw Error('failed');return {jobs,links:[...links]}},setPropertyJob:async(client,owner,area,job,link)=>{log.writes.push({owner,area,id:job.id,link});links=link?[...links,{area,job_id:job.id}]:links.filter(row=>row.job_id!==job.id)}}}
 const module={exports:{}};new Function('require','module','exports',code)(name=>{assert.ok(name in modules,name);return modules[name]},module,module.exports)
 const settle=async()=>{for(let n=0;n<15;n++){if(dirty){at=0;dirty=false;tree=module.exports.default({owner:'me',area:'water',navigation:{navigate:(...args)=>log.navigate.push(args)}});effects.splice(0).forEach(fn=>fn())}await new Promise(resolve=>setImmediate(resolve))}}
 await settle();return {jobs,log,all:()=>nodes(tree),async press(label){const node=nodes(tree).find(n=>n.props?.accessibilityLabel===label||n.props?.label===label);assert.ok(node,label);await node.props.onPress();await settle()}}
}
test('area job UI links existing work, refreshes, opens correct JobDetail and unlinks privately',async()=>{
 const app=await mount();await app.press('Repair trough');assert.deepEqual(app.log.navigate[0],['JobDetail',{job:app.jobs[0]}])
 await app.press('Link an existing job');await app.press('Link Clean barn');assert.deepEqual(app.log.writes[0],{owner:'me',area:'water',id:'b',link:true})
 await app.press('Clean barn');assert.equal(app.log.navigate.at(-1)[1].job.id,'b')
 await app.press('Remove job link: Clean barn');assert.deepEqual(app.log.writes.at(-1),{owner:'me',area:'water',id:'b',link:false})
 assert.ok(!app.all().some(n=>n.props?.accessibilityLabel==='Clean barn'))
})
test('area job UI reports failed reads and never claims there are no linked jobs',async()=>{
 const app=await mount(true);assert.ok(app.all().some(n=>n.props?.accessibilityRole==='alert'))
 assert.ok(app.all().some(n=>n.props?.label==='Retry jobs'))
 assert.ok(!app.all().some(n=>JSON.stringify(n.props?.children)==='["No jobs linked to this area yet."]'))
})
