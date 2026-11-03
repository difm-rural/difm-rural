import test from 'node:test'
import assert from 'node:assert/strict'
import {publicAreaError} from '../shared/publicArea.ts'
test('public areas retain macrons and ordinary place-name punctuation',()=>{
 for(const area of ['Waitoki','Te Kūiti','Ōtaki','Whangārei','Hawke’s Bay',"Arthur's Pass",'Palmerston North, Manawatū-Whanganui','Waitoki 0871','Nelson / Tasman','Auckland (North Shore)','Nelson & Tasman','O\u0304taki'])assert.equal(publicAreaError(area),'',area)
})
test('markup, emoji, quotes, control characters and punctuation-only values are rejected',()=>{
 for(const area of ['<b>Waitoki</b> & "quotes" 😀','Waitoki 😀','"Waitoki"','Waitoki\nAuckland','Waitoki\tAuckland','---','1234','Waitoki &lt;b&gt;','Waitoki\u200b'])assert.ok(publicAreaError(area),area)
})
test('required web areas and optional mobile areas keep their existing empty-field rules',()=>{
 assert.ok(publicAreaError(''))
 assert.equal(publicAreaError('',false),'')
 assert.equal(publicAreaError('x'.repeat(150)),'')
 assert.ok(publicAreaError('x'.repeat(151)))
})
