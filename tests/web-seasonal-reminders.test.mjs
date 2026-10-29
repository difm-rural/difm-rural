import assert from 'node:assert/strict'
import test from 'node:test'
import {loadSeasonalReminders,recordSeasonalEvent,SEASONAL_ACTIONS} from '../provider-web/src/lib/seasonal-reminders.ts'
test('Home uses the same personalised seasonal RPC as mobile',async()=>{
 const cards=[{id:'campaign',title:'Spring weeds',primary_action:'post_job'}]
 const calls=[]
 const client={async rpc(...args){calls.push(args);return {data:cards,error:null}}}
 assert.deepEqual(await loadSeasonalReminders(client),cards)
 assert.deepEqual(calls,[['get_my_seasonal_campaigns']])
})
test('seasonal failure never blocks Home',async()=>{
 assert.deepEqual(await loadSeasonalReminders({rpc:async()=>({error:new Error('Offline')})}),[])
 assert.deepEqual(await loadSeasonalReminders({rpc:async()=>{throw new Error('Offline')}}),[])
})
test('dismissal and engagement are recorded for the signed-in user through the guarded RPC',async()=>{
 const calls=[]
 const client={async rpc(...args){calls.push(args);return {error:null}}}
 for(const event of ['impression','action','dismiss'])assert.equal(await recordSeasonalEvent(client,'campaign',event),true)
 assert.deepEqual(calls.map(c=>c[1]),['impression','action','dismiss'].map(event=>({p_campaign_id:'campaign',p_event:event})))
 assert.ok(calls.every(c=>c[0]==='record_seasonal_campaign_event'))
 assert.equal(await recordSeasonalEvent({rpc:async()=>({error:new Error('Offline')})},'campaign','dismiss'),false)
 assert.equal(await recordSeasonalEvent({rpc:async()=>{throw new Error('Offline')}},'campaign','action'),false)
})
test('seasonal actions lead to the equivalent web destinations',()=>{
 assert.deepEqual(SEASONAL_ACTIONS,{
 post_job:{label:'Post a job',href:'/jobs/new'},
 browse_services:{label:'Browse listings',href:'/browse'},
 manage_profile:{label:'Update profile',href:'/account/profile'},
 })
})
