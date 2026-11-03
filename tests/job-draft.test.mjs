import test from 'node:test'
import assert from 'node:assert/strict'
import {hasJobDraftChanges,readJobDraft} from '../shared/jobDraft.ts'
const initial={title:'',description:'',category:'',schedule_type:'flexible',price_type:'open',price:'',photos:[],access_conditions:[],hide_exact_location:true}
const saved=draft=>JSON.stringify({id:'draft-id',draft})
test('blank and whitespace-only drafts do not count as authored content',()=>{
 assert.equal(hasJobDraftChanges(initial,initial),false)
 assert.equal(readJobDraft(saved({...initial,title:'  ',description:'\n'}),initial),null)
 assert.equal(readJobDraft(saved({}),initial),null)
})
test('untouched edit and repeat seeds do not cause a resume prompt',()=>{
 const seed={...initial,title:'Repair fence',description:'Existing work',photos:['existing-photo']}
 assert.equal(readJobDraft(saved(seed),seed),null)
 assert.equal(readJobDraft(saved({...seed,description:'Changed work'}),seed).draft.description,'Changed work')
 // Clearing a previously filled field is still a genuine edit worth preserving.
 assert.equal(readJobDraft(saved({...seed,title:''}),seed).draft.title,'')
})
test('schedule, privacy, photos and budget changes are retained without a title',()=>{
 for(const patch of [{schedule_type:'asap'},{hide_exact_location:false},{photos:['photo']},{price:'50'},{access_conditions:['dogs_on_property']}]){
  assert.ok(readJobDraft(saved({...initial,...patch}),initial))
 }
})
test('malformed storage cannot disable the form or introduce incorrectly typed fields',()=>{
 for(const raw of ['not json','null',saved([]),saved({title:42}),saved({photos:'broken'}),saved({photos:[{}]}),JSON.stringify({draft:{title:'Work'}})]){
  assert.equal(readJobDraft(raw,initial),null)
 }
 assert.equal(readJobDraft(saved({title:'Work',unexpected:'ignored'}),initial).draft.unexpected,undefined)
})
