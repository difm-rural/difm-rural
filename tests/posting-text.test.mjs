import test from 'node:test'
import assert from 'node:assert/strict'
import {POSTING_TITLE_MAX,POSTING_DESCRIPTION_MAX,postingTextError} from '../shared/postingText.ts'
test('title and description accept their exact limits and reject larger pasted or restored text',()=>{
 for(const [field,limit] of [['title',POSTING_TITLE_MAX],['description',POSTING_DESCRIPTION_MAX]]){
  assert.equal(postingTextError('x'.repeat(limit),field),'')
  assert.match(postingTextError('x'.repeat(limit+1),field),/characters or fewer/)
 }
 assert.ok(postingTextError('x'.repeat(400),'title'))
 assert.ok(postingTextError('x'.repeat(3000),'description'))
 assert.equal(postingTextError('','description'),'') // Listing descriptions are optional.
})
