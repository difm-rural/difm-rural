import test from 'node:test'
import assert from 'node:assert/strict'
import {openWizard} from './support/post-job-wizard.mjs'
import {editedJobPayload,jobEditSeed,jobPayload,privateAreaUpdate,tracedLocation} from '../shared/jobEdit.ts'

const AREA=[{latitude:-36.5,longitude:174.5},{latitude:-36.5,longitude:174.6},{latitude:-36.6,longitude:174.6}]
const NEW_AREA=[{latitude:-37,longitude:175},{latitude:-37,longitude:175.1},{latitude:-37.1,longitude:175.1}]
const base={id:'job-1',requester_id:'me',status:'open',visibility:'public',title:'Fix the fence',description:'Two posts down by the creek.',category:'Fencing & Gates',
 price_type:'fixed',price:250.5,latitude:-36.51,longitude:174.52,location_name:'165 Ireland Road, Waitoki 0871, New Zealand',location_area:'Near Waitoki',
 location_note:'Second gate',hide_exact_location:true,schedule_type:'specific',scheduled_date:'2099-03-01',date_from:null,date_to:null,
 materials_type:'provider',access_conditions:['4wd_required','dogs_on_property'],photos:['https://x/a.jpg','https://x/b.jpg'],
 area_polygon:AREA,area_hectares:12.3,repeated_from_job_id:'old',recurrence_frequency:'weekly'}
const ROWS={
 'with a traced area':base,
 'without a traced area':{...base,area_polygon:null,area_hectares:null},
 'with nothing optional set':{...base,price_type:'open',price:null,location_area:null,location_note:null,hide_exact_location:false,schedule_type:null,scheduled_date:null,
  materials_type:null,access_conditions:null,photos:null,area_polygon:null,area_hectares:null,repeated_from_job_id:null,recurrence_frequency:'one_time'},
 'with old formats and stray values':{...base,description:'  Line one\n\n\n\nLine two  ',scheduled_date:'2099-03-01T11:00:00+00:00',location_name:null,location_area:'Fairlie',access_conditions:[],photos:[],date_from:'2099-01-01'},
 'over a period, I supply materials':{...base,schedule_type:'range',scheduled_date:null,date_from:'2099-03-01',date_to:'2099-03-09',materials_type:'requester'},
}
const unchanged=(written,row,except=[])=>{
 for(const [key,value] of Object.entries(written))if(!except.includes(key))assert.deepEqual(value,row[key],key)
}
async function save(wizard){
 await wizard.toReview()
 assert.equal(wizard.step(),'PostJobStep5Review')
 assert.equal(wizard.params().mode,'edit')
 await wizard.press('Save changes')
 assert.equal(wizard.log.alerts.at(-1)?.[0],'Job updated')
 assert.deepEqual(wizard.log.inserts,[],'no second job')
 return Object.assign({},...wizard.log.updates)
}

for(const [label,row] of Object.entries(ROWS)){
 test('1. saving an untouched edit changes nothing: job '+label,async()=>{
  const wizard=await openWizard({row})
  await wizard.toReview()
  assert.equal(wizard.context().jobChanged,false,'and Cancel has nothing to ask about')
  unchanged(await save(wizard),row)
  assert.equal(wizard.log.gps,0)
 })
 test('2. changing the title and description leaves everything else: job '+label,async()=>{
  const wizard=await openWizard({row})
  await wizard.type('Job title','Fix both fences');await wizard.next();await wizard.next()
  await wizard.type('Job description','Four posts now.')
  const written=await save(wizard)
  assert.equal(written.title,'Fix both fences');assert.equal(written.description,'Four posts now.')
  unchanged(written,row,['title','description'])
 })
 test('3 and 7. tracing updates the same job: job '+label,async()=>{
  const wizard=await openWizard({row})
  await wizard.next();await wizard.press(row.area_polygon?'Edit traced work area':'Trace work area')
  assert.equal(wizard.step(),'AreaTracer')
  if(row.area_polygon)await wizard.press('Clear all points')
  for(const point of NEW_AREA)await wizard.tap(point)
  await wizard.press('Confirm area')
  assert.deepEqual(wizard.names(),['ActivityMain','ManageTask','PostJob','PostJobStep2Location'],'back on the one Location step')
  assert.equal(wizard.params().mode,'edit');assert.equal(wizard.params().job.id,'job-1')
  const written=await save(wizard)
  assert.deepEqual(written.area_polygon,NEW_AREA);assert.ok(Number(written.area_hectares)>0)
  unchanged(written,row,['area_polygon','area_hectares'])
 })
}

test('3. reopening the trace and confirming it as it was changes nothing',async()=>{
 const wizard=await openWizard({row:base})
 await wizard.next();await wizard.press('Edit traced work area');await wizard.press('Confirm area')
 unchanged(await save(wizard),base)
})

test('3. removing the trace, or moving the pin, is saved as chosen',async()=>{
 const removed=await openWizard({row:base})
 await removed.next();await removed.press('Remove traced area')
 const without=await save(removed)
 assert.equal(without.area_polygon,null);assert.equal(without.area_hectares,null)
 unchanged(without,base,['area_polygon','area_hectares'])
 const moved=await openWizard({row:base})
 await moved.next();await moved.map({latitude:-38,longitude:176})
 const there=await save(moved)
 assert.equal(there.latitude,-38);assert.equal(there.location_name,'9 New Road, Elsewhere 0999, New Zealand');assert.equal(there.location_area,'Elsewhere 0999')
 unchanged(there,base,['latitude','longitude','location_name','location_area','area_polygon','area_hectares'])
})

test('4. materials chosen in the edit are saved; access loaded from the job is saved, changed or not',async()=>{
 for(const [from,label,to] of [['provider','I supply materials','requester'],['requester','No materials needed','none'],[null,'Provider to supply','provider'],['provider','No materials needed','none']]){
  const row={...base,materials_type:from},wizard=await openWizard({row})
  await wizard.next();await wizard.next();await wizard.next();await wizard.choose(label)
  const written=await save(wizard)
  assert.equal(written.materials_type,to);unchanged(written,row,['materials_type'])
 }
 // The app has no control for access (the website does); the mapping still carries a change.
 const seed=jobEditSeed(base)
 assert.deepEqual(editedJobPayload({...seed,accessConditions:['park_and_walk']},base.category,base).access_conditions,['park_and_walk'])
 assert.equal(editedJobPayload({...seed,accessConditions:[]},base.category,base).access_conditions,null)
})

test('5. discarding an edit writes nothing, and reopening it shows the saved job',async()=>{
 const wizard=await openWizard({row:base})
 await wizard.type('Job title','Scrap this');await wizard.next();await wizard.press('Edit traced work area')
 for(const point of NEW_AREA)await wizard.tap(point)
 await wizard.press('Confirm area')
 assert.equal(wizard.context().jobChanged,true)
 await wizard.leave()
 assert.deepEqual(wizard.names(),['ActivityMain','ManageTask'])
 assert.deepEqual([wizard.log.updates,wizard.log.inserts,wizard.log.rpc],[[],[],[]])
 await wizard.open({job:base,mode:'edit',bidCount:0})
 unchanged(await save(wizard),base)
})

test('6. Back from the tracer and through the steps keeps one of each screen, the edit and the job',async()=>{
 const wizard=await openWizard({row:base})
 await wizard.next();await wizard.press('Edit traced work area');await wizard.tap(NEW_AREA[0]);await wizard.press('Go back')
 assert.deepEqual(wizard.names().slice(2),['PostJob','PostJobStep2Location'])
 await wizard.press('Edit traced work area');await wizard.press('Confirm area')
 await wizard.next();assert.equal(wizard.step(),'PostJobStep3Details')
 await wizard.back();assert.equal(wizard.step(),'PostJobStep2Location')
 await wizard.back();assert.equal(wizard.step(),'PostJob')
 await wizard.back().catch(()=>{}) // Step 1 has no Back, only Cancel
 assert.deepEqual(wizard.names(),['ActivityMain','ManageTask','PostJob'])
 unchanged(await save(wizard),base)
})

test('private job: the trace is saved, its other fields are kept, and a failed trace is reported',async()=>{
 const row={...base,visibility:'invite_only',photos:[]}
 const untouched=await openWizard({row});await save(untouched)
 const [name,args]=untouched.log.rpc.at(-1)
 assert.equal(name,'save_job_with_private_photos');assert.equal(args.p_job,'job-1')
 unchanged(args.p_details,row);assert.deepEqual(untouched.log.updates,[])
 for(const fails of [false,true]){
  const wizard=await openWizard({row});wizard.log.areaFails=fails
  await wizard.next();await wizard.press('Edit traced work area');await wizard.press('Clear all points')
  for(const point of NEW_AREA)await wizard.tap(point)
  await wizard.press('Confirm area');await save(wizard)
  assert.deepEqual(wizard.log.updates.map(update=>update.area_polygon),[NEW_AREA])
  unchanged(wizard.log.rpc.at(-1)[1].p_details,row,['area_polygon','area_hectares'])
  assert.equal(/could not be saved/.test(wizard.log.alerts.at(-1)[1]),fails)
 }
 // The database clears the area when the location moves, and keeps it otherwise.
 assert.equal(privateAreaUpdate({...row},row),null)
 assert.deepEqual(privateAreaUpdate({...row,latitude:-38},row),{area_polygon:AREA,area_hectares:12.3})
 assert.equal(privateAreaUpdate({...row,latitude:-38,area_polygon:null},row),null)
 assert.deepEqual(privateAreaUpdate({...row,area_polygon:null,area_hectares:null},row),{area_polygon:null,area_hectares:null})
})

test('an edit that has lost its job is refused, never posted again',async()=>{
 const wizard=await openWizard({row:base})
 await wizard.toReview()
 wizard.params().mode=undefined;await wizard.act(()=>{})
 await wizard.press('Post job')
 assert.equal(wizard.log.alerts.at(-1)[0],'Could not save job changes')
 assert.deepEqual([wizard.log.inserts,wizard.log.updates],[[],[]])
})

test('new, repeated and invited jobs post as before, with the traced area as the pin',async()=>{
 const fresh=await openWizard({params:{origin:'Jobs'}})
 await fresh.type('Job title','Mow the lawn');await fresh.choose("I'm flexible");await fresh.next()
 await fresh.press('Trace work area');for(const point of NEW_AREA)await fresh.tap(point)
 await fresh.press('Confirm area')
 assert.equal(fresh.params().origin,'Jobs')
 await fresh.next();await fresh.type('Job description','About half a hectare.');await fresh.next();await fresh.choose('Open to offers');await fresh.next();await fresh.press('Post job')
 const [job]=fresh.log.inserts
 assert.equal(job.materials_type,'none');assert.deepEqual(job.area_polygon,NEW_AREA);assert.ok(Math.abs(job.latitude+37.0333)<.001)
 assert.equal(job.status,'open');assert.deepEqual(fresh.log.updates,[])
 const repeat=await openWizard({params:{mode:'repeat',repeatJob:{...base,schedule_type:'flexible'},origin:'Activity'}})
 await repeat.toReview();await repeat.press('Post repeated job')
 assert.equal(repeat.log.inserts[0].materials_type,'provider');assert.deepEqual(repeat.log.inserts[0].access_conditions,base.access_conditions)
 assert.equal(repeat.log.inserts[0].repeated_from_job_id,'job-1')
 const invite=await openWizard({params:{inviteProviderId:'p',inviteProviderName:'Ana'}})
 await invite.type('Job title','Mow the lawn');await invite.choose("I'm flexible");await invite.next();await invite.map({latitude:-38,longitude:176})
 await invite.next();await invite.type('Job description','About half a hectare.');await invite.next();await invite.choose('Open to offers');await invite.next();await invite.press('Send invitation')
 assert.equal(invite.log.rpc[0][0],'create_invited_job');assert.equal(invite.log.rpc[0][1].p_provider_id,'p')
})

test('every column the wizard saves is one it loads; columns it was not given are not written',()=>{
 for(const row of Object.values(ROWS))assert.deepEqual(editedJobPayload(jobEditSeed(row),row.category,row),
  Object.fromEntries(Object.keys(jobPayload(jobEditSeed(row),row.category)).map(key=>[key,row[key]])))
 const {materials_type,access_conditions,...partial}=base
 const payload=editedJobPayload(jobEditSeed(partial),base.category,partial)
 assert.equal('materials_type' in payload,false);assert.equal('access_conditions' in payload,false)
})

test('editing: a placed pin stays; a pin that was the old area\'s centre follows the new one',()=>{
 const centre={latitude:(-36.5-36.5-36.6)/3,longitude:(174.5+174.6+174.6)/3}
 const result={polygonPoints:NEW_AREA,areaHectares:'1',centroid:{latitude:-37,longitude:175}}
 assert.equal(tracedLocation({editing:true,points:AREA,pin:{latitude:-36.51,longitude:174.52},result}).pin,null)
 assert.deepEqual(tracedLocation({editing:true,points:AREA,pin:centre,result}).pin,result.centroid)
 assert.deepEqual(tracedLocation({editing:true,points:[],pin:{latitude:null,longitude:null},result}).pin,result.centroid)
 assert.deepEqual(tracedLocation({editing:false,points:AREA,pin:{latitude:-36.51,longitude:174.52},result}).pin,result.centroid)
 assert.equal(tracedLocation({editing:true,points:AREA,pin:centre,result:{polygonPoints:AREA}}),null)
})

test('the wizard shows the saved materials and access',async()=>{
 const wizard=await openWizard({row:base})
 await wizard.next();await wizard.next();await wizard.next()
 assert.equal(wizard.step(),'PostJobStep4Budget')
 assert.deepEqual(wizard.selected(),['Fixed price','Provider to supply'])
 await wizard.next()
 assert.ok(wizard.texts().includes('Provider to supply'))
 assert.ok(wizard.texts().some(text=>/4WD required, Dogs on property/.test(text)))
 const blank=await openWizard({row:ROWS['with nothing optional set']})
 await blank.next();await blank.next();await blank.next()
 assert.deepEqual(blank.selected(),['Open to offers'],'no materials choice is made for them')
})
