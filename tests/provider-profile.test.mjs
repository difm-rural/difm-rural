import test from 'node:test'
import assert from 'node:assert/strict'
import {openProviderProfile} from './support/provider-profile-screen.mjs'

const PETER={id:'peter',full_name:'Peter Provider',primary_role:'provider',created_at:'2026-06-01T00:00:00Z'}
// Peter's live listings: a hire with an available-from date and no travel range
// (the one that crashed the profile), and a grazing listing with neither.
const PETER_SERVICES=[
 {id:'trailer',provider_id:'peter',title:'Large trailer for hire',category:'Machinery',pricing_type:'day_rate',rate:50,travel_range_km:null,availability:['2026-11-18'],includes_equipment:false},
 {id:'grazing',provider_id:'peter',title:'2 paddocks with water available for grazing',category:'Grazing',pricing_type:'per_unit',rate:50,unit_label:'head/week',travel_range_km:null,availability:null},
]
const peter=services=>openProviderProfile({params:{providerId:'peter'},rows:{profiles_public:PETER,services,bids:[{job_id:'j',status:'accepted'}],reviews:[]}})

test('a provider whose listing has an available-from date and no travel range opens',async()=>{
 const {texts}=await peter(PETER_SERVICES)
 assert.ok(texts.includes('Peter P.'))
 assert.ok(texts.includes('Large trailer for hire'))
 // A date is not a weekday: no Coverage card made of seven unlit days.
 assert.ok(!texts.includes('Coverage'))
 assert.ok(!texts.includes('Mon'))
})

test('weekday availability and travel range still show as Coverage',async()=>{
 const {texts}=await peter([{...PETER_SERVICES[0],availability:['Mon','2026-11-18'],travel_range_km:30,location_name:'Kaukapakapa'}])
 assert.ok(texts.includes('Coverage'));assert.ok(texts.includes('Mon'));assert.ok(texts.includes('Operates within '));assert.ok(texts.includes('30'))
 const days=await peter([{...PETER_SERVICES[0],availability:['Sat']}])
 assert.ok(days.texts.includes('Coverage'));assert.ok(days.texts.includes('Sat'))
})

test('a provider with no profile row, listings or reviews still opens',async()=>{
 const {texts}=await openProviderProfile({params:{providerId:'gone'},rows:{profiles_public:null}})
 assert.ok(texts.includes('Provider'))
})
