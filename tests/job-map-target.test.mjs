import test from 'node:test'
import assert from 'node:assert/strict'
import {jobMapTarget} from '../shared/jobMapTarget.ts'
import {editorScheduleType} from '../shared/postingDates.ts'
const pin={latitude:-36.637,longitude:174.539}
test('town-only and masked jobs do not advertise property directions',()=>{
 for(const job of [{...pin,location_name:'Waitoki 0871',location_area:'Waitoki'},{...pin,location_name:'Waitoki, Auckland, New Zealand'},{...pin,location_name:null,location_area:'Waitoki'},{latitude:null,longitude:null,location_name:'123 Waitoki Road'},{latitude:'',longitude:174.5,location_name:'123 Waitoki Road'}])assert.equal(jobMapTarget(job),null)
})
test('numbered property locations and explicit pins keep accurate labels',()=>{
 const address=jobMapTarget({...pin,location_name:'123 Waitoki Road',location_area:'Waitoki'})
 assert.equal(address.kind,'address');assert.equal(address.label,'Open job location in Maps')
 assert.equal(address.href,'https://www.google.com/maps/search/?api=1&query=-36.637%2C174.539')
 assert.equal(jobMapTarget(pin).kind,'pin')
 assert.equal(jobMapTarget({...pin,location_name:'452X+2X Momona'}).label,'Open job pin in Maps')
 assert.equal(jobMapTarget({...pin,location_name:'Waitoki',area_polygon:[[1,2],[3,4],[5,6]]}).kind,'pin')
})
test('editor timing retains explicit saved choices and infers missing legacy timing only',()=>{
 assert.equal(editorScheduleType({schedule_type:'specific',scheduled_date:'2030-12-01'}),'specific')
 assert.equal(editorScheduleType({schedule_type:' Specific '}),'specific')
 assert.equal(editorScheduleType({scheduled_date:'2030-12-01'}),'specific')
 assert.equal(editorScheduleType({date_from:'2030-12-01',date_to:'2030-12-02'}),'range')
 assert.equal(editorScheduleType({schedule_type:'flexible',scheduled_date:'2030-12-01'}),'flexible')
 assert.equal(editorScheduleType({schedule_type:'legacy'}),'legacy')
})
