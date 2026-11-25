import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {LETTERS,OTHERS,PUBLIC_AREA_PUNCTUATION} from '../shared/publicAreaCharacters.ts'
import { publicAreaError } from '../shared/publicArea.ts'

const sql = await readFile(new URL('../supabase/migrations/20261125004045_public_area_format.sql', import.meta.url), 'utf8')

function spans(name) {
  const match = sql.match(new RegExp(`${name} integer\\[] := array\\[([\\s\\S]*?)\\n  \\]`))
  assert.ok(match, name)
  return match[1].split(',').map(part => Number(part.trim())).filter(Number.isFinite)
}
const letters = spans('letters')
const others = spans('others')
const punctuation = new Set([32, 46, 44, 39, 8217, 40, 41, 38, 47, 45])

function contains(list, cp) {
  for (let i = 0; i < list.length; i += 2) if (cp >= list[i] && cp <= list[i + 1]) return true
  return false
}
function sqlAreaError(value) {
  const area = String(value ?? '').replace(/^ +| +$/g,'')
  if (!area) return ''
  if ([...area].length > 150) return 'Public town or area must be 150 characters or fewer.'
  let hasLetter = false
  for (const ch of area) {
    const cp = ch.codePointAt(0)
    if (punctuation.has(cp)) continue
    if (contains(letters, cp)) { hasLetter = true; continue }
    if (!contains(others, cp)) return 'town or area'
  }
  return hasLetter ? '' : 'town or area'
}

test('the migration rejects the same public areas as publicAreaError', () => {
  const samples = [
    'Waitoki', 'Te Kūiti', 'Ōtaki', 'Whangārei', 'Hawke’s Bay', "Arthur's Pass",
    'Palmerston North, Manawatū-Whanganui', 'Waitoki 0871', 'Nelson / Tasman',
    'Auckland (North Shore)', 'Nelson & Tasman', 'O\u0304taki', '  Waitoki  ',
    '<b>Waitoki</b> & "quotes" 😀', 'Waitoki 😀', '"Waitoki"', 'Waitoki\nAuckland',
    'Waitoki\tAuckland', '---', '1234', 'Waitoki &lt;b&gt;', 'Waitoki\u200b',
    '', '   ', 'x'.repeat(150), 'x'.repeat(151),
  ]
  for (const area of samples) {
    const js = publicAreaError(area, false)
    const db = sqlAreaError(area)
    assert.equal(Boolean(db), Boolean(js), area)
    if (js.includes('150')) assert.match(db, /150/)
  }
})

test('every Unicode scalar in the BMP matches the JavaScript public-area rule', () => {
  for (let cp = 0; cp <= 0xFFFF; cp++) {
    if (cp >= 0xD800 && cp <= 0xDFFF) continue
    const ch = String.fromCodePoint(cp)
    const js = publicAreaError(ch, false)
    const db = sqlAreaError(ch)
    assert.equal(Boolean(db), Boolean(js), `U+${cp.toString(16)} ${js} / ${db}`)
  }
  assert.equal(sqlAreaError('😀'), 'town or area')
  assert.equal(sqlAreaError('\u{1F642}'), 'town or area')
})

test('services validation is named to run after the listing privacy trigger', () => {
  assert.match(sql, /validate_public_town_or_area/)
  assert.ok('protect_listing_location' < 'validate_public_town_or_area')
  assert.match(sql, /before insert or update on public\.jobs/)
  assert.match(sql, /before insert or update on public\.services/)
  assert.match(sql, /tg_op = 'UPDATE'/)
  assert.match(sql, /location_area/)
  assert.match(sql, /location_name/)
})

test('client ranges and punctuation exactly match the existing database policy',()=>{
 assert.deepEqual([...LETTERS],letters);assert.deepEqual([...OTHERS],others)
 assert.deepEqual([...PUBLIC_AREA_PUNCTUATION],[...punctuation])
 for(const spans of [LETTERS,OTHERS])for(let i=0;i<spans.length;i+=2){
  assert.ok(spans[i]<=spans[i+1]);if(i)assert.ok(spans[i]>spans[i-1])
 }
})
test('every fixed-range boundary matches SQL including supplementary planes',()=>{
 for(const spans of [letters,others])for(let i=0;i<spans.length;i+=2){
  for(const cp of [spans[i]-1,spans[i],spans[i+1],spans[i+1]+1]){
   if(cp<0||cp>0x10FFFF||(cp>=0xD800&&cp<=0xDFFF))continue
   const area='W'+String.fromCodePoint(cp)
   assert.equal(Boolean(publicAreaError(area,false)),Boolean(sqlAreaError(area)),`U+${cp.toString(16)}`)
  }
 }
})
test('representative scripts and combining marks retain the established policy',()=>{
 for(const area of ['Te Kūiti','O\u0304taki','العربية','हिन्दी','北京','𐐀','W𝟘'])assert.equal(publicAreaError(area),'',area)
 for(const area of ['W\u088F','W\u0890','W\u200D','W\u200B','W😀','W<','W"','W\uD800','W\u{10FFFF}','\u0304','123'])assert.ok(publicAreaError(area),area)
})
test('length uses SQL code points and only SQL-trimmable spaces are ignored',()=>{
 assert.equal(publicAreaError('𐐀'.repeat(150)),'')
 assert.match(publicAreaError('𐐀'.repeat(151)),/150/)
 assert.equal(publicAreaError('  Te Kūiti  '),'')
 assert.equal(publicAreaError('',false),'');assert.ok(publicAreaError('',true))
 for(const area of ['\tWaitoki','Waitoki\n','\u00A0Waitoki','Waitoki\u3000']){
  assert.ok(publicAreaError(area),JSON.stringify(area));assert.ok(sqlAreaError(area))
 }
})
