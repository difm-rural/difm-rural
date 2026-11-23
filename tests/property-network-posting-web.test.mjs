import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as network from '../shared/propertyNetworkJobs.ts'
import {CATEGORIES} from '../shared/categories.ts'
const require=createRequire(import.meta.url),source=readFileSync(new URL('../provider-web/src/app/work-actions.ts',import.meta.url),'utf8')
const code=require('typescript').transpileModule(source,{compilerOptions:{module:require('typescript').ModuleKind.CommonJS,target:require('typescript').ScriptTarget.ES2022}}).outputText
function setup({postFails=false,linkFails=false,invite=false,photo=false,origin=true,owner='me',area='water'}={}){
 const jobs=new Map(),links=new Map(),calls=[]
 const db={from(table){let filters=[];const q={select(){return q},eq(key,value){filters.push([key,value]);return q},maybeSingle(){const row=jobs.get('job');return {data:row&&filters.every(([k,v])=>row[k]===v)?row:null,error:null}},insert(row){calls.push({kind:'insert',table,row});if(postFails)return {error:{code:'failed'}};jobs.set(row.id,row);return {error:null}},upsert(row,options){calls.push({kind:'upsert',table,row,options});if(linkFails)return {error:{code:'failed'}};links.set([row.owner_id,row.area,row.job_id].join(':'),row);return {error:null}}};return q},
  rpc:async(name,args)=>{calls.push({kind:'rpc',name,args});if(postFails)return {error:{code:'failed'}};jobs.set(args.p_job_id,{id:args.p_job_id,requester_id:'me'});return {data:args.p_job_id,error:null}},
  functions:{invoke:async(name,args)=>{calls.push({kind:'photo',name,args});if(postFails)return {data:null,error:{code:'failed'}};jobs.set('job',{id:'job',requester_id:'me'});return {data:{id:'job'},error:null}}}}
 const modules={'@shared/propertyNetworkJobs':network,'@shared/categories':{CATEGORIES},'next/navigation':{redirect:path=>{throw Error('REDIRECT:'+path)}},'next/cache':{revalidatePath(){}},'@/lib/auth':{requireProvider:async()=>({supabase:db,user:{id:'me'}})},'@/lib/job-input':{validId:id=>!!id,jobInput:()=>({ok:true,value:{title:'Maintenance',description:'Fix a trough',photos:[]}})},'@shared/flowFeedback':{},'@shared/photos':{},'@shared/dates':{},'@/lib/offer-input':{},'@/lib/booking-detail':{}}
 const module={exports:{}};new Function('require','module','exports',code)(name=>{assert.ok(name in modules,name);return modules[name]},module,module.exports)
 const data=new FormData();data.set('job_id','job');data.set('category',CATEGORIES[0]);if(origin){data.set('property_owner',owner);data.set('property_area',area)}
 if(invite)data.set('invite_provider_id','provider')
 if(photo){data.set('primary_photo_required','on');data.set('primary_photo_checksum','a'.repeat(64))}
 return {calls,jobs,links,post:()=>module.exports.postJob({error:''},data)}
}
for(const mode of ['public','invited','photo'])test('web '+mode+' posting associates only the confirmed created job',async()=>{
 const h=setup({invite:mode==='invited',photo:mode==='photo'});await assert.rejects(h.post(),/REDIRECT:\/jobs\/job\?posted=1$/)
 assert.equal(h.jobs.size,1);assert.equal(h.links.size,1)
 const link=h.calls.find(c=>c.kind==='upsert');assert.deepEqual(link.row,{owner_id:'me',area:'water',job_id:'job'});assert.equal(link.options.ignoreDuplicates,true)
 assert.equal(h.calls.at(-1).kind,'upsert')
})
test('web retried posting reuses its draft job id and does not duplicate private links',async()=>{
 const h=setup();await assert.rejects(h.post(),/REDIRECT/);await assert.rejects(h.post(),/REDIRECT/)
 assert.equal(h.calls.filter(c=>c.kind==='insert').length,1);assert.equal(h.links.size,1)
})
for(const mode of ['public','invited','photo'])test('web failed '+mode+' creation never associates a job',async()=>{
 const h=setup({postFails:true,invite:mode==='invited',photo:mode==='photo'});assert.ok((await h.post()).error);assert.equal(h.links.size,0);assert.ok(!h.calls.some(c=>c.kind==='upsert'))
})
test('web rejects foreign-property origin before creating a job or association',async()=>{
 for(const values of [{owner:'other'},{area:'invalid'}]){const h=setup(values);assert.ok((await h.post()).error);assert.deepEqual(h.calls,[])}
})
test('web ordinary posts remain independent and partial failures warn without duplicating work',async()=>{
 const ordinary=setup({origin:false});await assert.rejects(ordinary.post(),/posted=1$/);assert.equal(ordinary.links.size,0);assert.ok(!ordinary.calls.some(c=>c.kind==='upsert'))
 const h=setup({linkFails:true});await assert.rejects(h.post(),/posted=1&propertyLinkFailed=1&propertyArea=water/);assert.equal(h.jobs.size,1);assert.equal(h.links.size,0)
})
