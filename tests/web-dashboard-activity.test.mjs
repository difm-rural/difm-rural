import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {rankOnTheGo} from '../shared/onTheGo.ts'
import {jobNextMove,bookingNextMove} from '../shared/nextMove.ts'
import {homeCustomerCount,homeNetworkSummary,homeUpcoming,homeWorkSummary} from '../shared/homeSummary.ts'

const require=createRequire(import.meta.url),ts=require('typescript')
const webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url))
const jsx=webRequire('react/jsx-runtime'),{renderToStaticMarkup}=webRequire('react-dom/server')
const source=await readFile(new URL('../provider-web/src/app/page.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText

async function dashboard({viewError=false,awardError=false,awardHidden=false,onlyPending=false}={}){
 const calls=[]
 const jobs=[
  {id:'awarded',title:'Awarded fence',status:'accepted',requester_id:'owner',created_at:'2026-11-01'},
  {id:'pending',title:'Pending fence',status:'open',requester_id:'owner',created_at:'2026-11-11'},
 ].slice(onlyPending?1:0)
 const offers=[
  {id:'winning',job_id:'awarded',status:'accepted',created_at:'2026-11-02',payment_method:'agreed'},
  {id:'waiting',job_id:'pending',status:'pending',created_at:'2026-11-12'},
 ].slice(onlyPending?1:0)
 const client={from(table){
  const call={table,filters:[]};calls.push(call)
  const query={
   select(cols){call.cols=cols;return query},
   eq(key,value){call.filters.push(['eq',key,value]);return query},
   in(key,value){call.filters.push(['in',key,Array.from(value)]);return query},
   or(){return query}, order(){return query}, limit(){return query}, is(){return query},
   then(resolve){
    let data=[],error=null
    if(table==='jobs_public'){
     if(viewError||call.cols.includes('accepted_at'))error={code:'42703'}
     else data=jobs
    }
    if(table==='bids'&&call.cols.startsWith('id,job_id'))data=offers
    if(table==='bids'&&call.cols.includes('job:jobs')){
     if(awardError)error={code:'fixture'}
     else data=[{job_id:'awarded',job:awardHidden?null:{accepted_at:'2026-11-16'}}]
    }
    if(table==='work_schedules')data=[{job_id:'awarded',arrival_start_at:'2099-11-30T21:00:00Z'}]
    return Promise.resolve({data,error}).then(resolve)
   },
  }
  return query
 }}
 const exports={}
 const imports={
  'react/jsx-runtime':jsx,
  '@shared/formatting':{formatDate:()=>''},
  '@shared/notificationBody':{},'@shared/marketSide':{},
  '@shared/nextMove':{jobNextMove,bookingNextMove},'@shared/onTheGo':{rankOnTheGo},
  '@shared/propertyNetwork':{loadPropertyNetwork:async()=>null,propertyAreas:()=>[],propertySpokes:()=>[]},
  '@shared/homeSummary':{homeCustomerCount,homeNetworkSummary,homeUpcoming,homeWorkSummary},
  '@/components/home-modes':{HomeModes:({work})=>work},
  '@/components/seasonal-reminders':{SeasonalReminders:()=>null},
  '@/lib/seasonal-reminders':{loadSeasonalReminders:()=>[]},
  '@/components/navigation-link':{default:'a'},
  'lucide-react':new Proxy({}, {get:()=>()=>null}),
  '@/lib/auth':{requireProvider:async()=>({supabase:client,user:{id:'viewer'},profile:{full_name:'Fixture',region:'Test'}})},
  '@/components/app-shell':{AppShell:({children})=>children},
  '@/components/live-refresh':{LiveRefresh:()=>null},
  '@/lib/work':{ACTIVE_JOBS:['open','accepted'],ACTIVE_BOOKINGS:['pending']},
 }
 vm.runInNewContext(code,{exports,require(name){assert.ok(name in imports,name);return imports[name]}})
 return {html:renderToStaticMarkup(await exports.default()),calls}
}

test('dashboard ranks awards using a participant-filtered timestamp and keeps job details on the public view',async()=>{
 const {html,calls}=await dashboard()
 assert.doesNotMatch(html,/Some activity could not be loaded/)
 assert.match(html,/Awarded fence.*Pending fence/)
 const view=calls.find(call=>call.table==='jobs_public')
 assert.equal(view.cols,'id,title,status,requester_id,created_at,scheduled_date,date_from')
 assert.match(html,/<strong>1<\/strong> Upcoming confirmed/)
 const award=calls.find(call=>call.table==='bids'&&call.cols.includes('job:jobs'))
 assert.equal(award.cols,'job_id,job:jobs(accepted_at)')
 assert.deepEqual(award.filters,[['eq','provider_id','viewer'],['eq','status','accepted'],['in','job_id',['awarded']]])
})

test('pending offers never read the base job timestamp',async()=>{
 const {html,calls}=await dashboard({onlyPending:true})
 assert.match(html,/Pending fence/)
 assert.doesNotMatch(html,/Some activity could not be loaded/)
 assert.ok(!calls.some(call=>call.table==='bids'&&call.cols.includes('job:jobs')))
 assert.ok(!calls.some(call=>call.table==='work_schedules'))
})

test('dashboard keeps available activity and signals an actual lookup error',async()=>{
 const award=await dashboard({awardError:true})
 assert.match(award.html,/Some activity could not be loaded/)
 assert.match(award.html,/Pending fence.*Awarded fence/)
 const view=await dashboard({viewError:true})
 assert.match(view.html,/Some activity could not be loaded/)
 assert.ok(!view.calls.some(call=>call.table==='bids'&&call.cols.includes('job:jobs')))
 const hidden=await dashboard({awardHidden:true})
 assert.doesNotMatch(hidden.html,/Some activity could not be loaded/)
 assert.match(hidden.html,/Pending fence.*Awarded fence/)
})
