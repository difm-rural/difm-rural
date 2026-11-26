import test from 'node:test'
import assert from 'node:assert/strict'
import {loadReviewPrompts,dismissReviewPrompt} from '../shared/reviewPrompts.ts'

// Minimal supabase-js stand-in: every builder call chains; awaiting returns the table's rows.
function client(tables,inserts=[]){
 return {from(table){
  const q={select(){return q},eq(){return q},gte(){return q},in(){return q},or(){return q},
   insert(row){inserts.push({table,row});return Promise.resolve({error:tables.insertError||null})},
   then(resolve,reject){return Promise.resolve({data:tables[table]||[],error:null}).then(resolve,reject)}}
  return q
 }}
}
const now=new Date('2026-11-27T00:00:00Z')
const base={
 jobs:[{id:'j1',title:'Help clean barn',created_at:'2026-11-20T00:00:00Z'},{id:'j2',title:'Mow lawns',created_at:'2026-11-21T00:00:00Z'}],
 bids:[{job_id:'j1',provider_id:'paul'},{job_id:'j2',provider_id:'paul'}],
 profiles_public:[{id:'paul',full_name:'Paul Smith'}],
}

test('dismissed review prompts stay hidden; others still show',async()=>{
 const shown=await loadReviewPrompts(client({...base,review_prompt_dismissals:[{job_id:'j1',booking_id:null,reviewer_role:'requester'}]}),'me',now)
 assert.deepEqual(shown.map(p=>p.title),['Mow lawns'])
 assert.equal(shown[0].next.detail,'Leave a review for Paul')
})

test('a dismissal in the other role does not hide this prompt',async()=>{
 const shown=await loadReviewPrompts(client({...base,review_prompt_dismissals:[{job_id:'j1',booking_id:null,reviewer_role:'provider'}]}),'me',now)
 assert.equal(shown.length,2)
})

test('dismissing records the subject and role, and a repeat dismissal is not an error',async()=>{
 const inserts=[]
 await dismissReviewPrompt(client({},inserts),{kind:'booking',id:'b1',viewerRole:'provider'})
 assert.deepEqual(inserts,[{table:'review_prompt_dismissals',row:{job_id:null,booking_id:'b1',reviewer_role:'provider'}}])
 await dismissReviewPrompt(client({insertError:{code:'23505'}}),{kind:'job',id:'j1',viewerRole:'requester'})
 await assert.rejects(dismissReviewPrompt(client({insertError:{code:'42501'}}),{kind:'job',id:'j1',viewerRole:'requester'}))
})
