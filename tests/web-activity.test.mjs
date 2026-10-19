import assert from 'node:assert/strict'
import test from 'node:test'
import { workActions, workRole, activityIsActive } from '../provider-web/src/lib/activity-policy.ts'
const work=(patch={})=>({id:'arrangement',kind:'booking',status:'confirmed',requesterId:'paul',providerId:'peter',title:'Water delivery',location:null,notes:null,...patch})

test('providers complete work; requesters request cancellation after acceptance',()=>{
  assert.deepEqual(workActions(work(),'peter'),['complete'])
  assert.deepEqual(workActions(work(),'paul'),['request_cancel'])
  assert.deepEqual(workActions(work({kind:'job',status:'in_progress'}),'peter'),['complete'])
  assert.deepEqual(workActions(work({kind:'job',status:'in_progress'}),'paul'),['cancel'])
  assert.deepEqual(workActions(work({status:'cancellation_requested'}),'peter'),['confirm_cancel'])
  assert.deepEqual(workActions(work({status:'cancellation_requested'}),'paul'),[])
})
test('pending and quote-sent requests can be withdrawn, not completed',()=>{
  for(const status of ['pending','quote_sent']){
    assert.deepEqual(workActions(work({status}),'paul'),['withdraw'])
    assert.deepEqual(workActions(work({status}),'peter'),[])
  }
})
test('grazing completion changes listing availability only through explicit close/relist choices',()=>{
  assert.deepEqual(workActions(work({listingKind:'grazing'}),'peter'),['close_grazing','relist_grazing'])
  assert.deepEqual(workActions(work({listingKind:'grazing',status:'completed',closedAt:'2026-10-19'}),'peter'),['review','relist'])
  assert.deepEqual(workActions(work({listingKind:'grazing',status:'completed',closedAt:null}),'peter'),['review'])
})
test('reviews require completed work and a known counterpart; outsiders never get actions',()=>{
  assert.deepEqual(workActions(work({status:'completed'}),'paul'),['review'])
  assert.deepEqual(workActions(work({status:'completed'}),'peter'),['review'])
  assert.deepEqual(workActions(work({kind:'job',status:'completed',providerId:null}),'paul'),[])
  for(const status of ['cancelled','withdrawn','declined'])assert.deepEqual(workActions(work({status}),'paul'),[])
  assert.equal(workRole(work(),'outsider'),null)
  for(const status of ['confirmed','pending','completed'])assert.deepEqual(workActions(work({status,listingKind:'grazing',closedAt:'today'}),'outsider'),[])
})
test('Active and History partition current and closed arrangements and stale offers',()=>{
  assert.equal(activityIsActive('job','open'),true)
  assert.equal(activityIsActive('booking','cancellation_requested'),true)
  assert.equal(activityIsActive('booking','completed'),false)
  assert.equal(activityIsActive('offer','pending','open'),true)
  assert.equal(activityIsActive('offer','pending','cancelled'),false)
  assert.equal(activityIsActive('offer','accepted','in_progress'),true)
  assert.equal(activityIsActive('offer','accepted','completed'),false)
  assert.equal(activityIsActive('offer','rejected','open'),false)
})
