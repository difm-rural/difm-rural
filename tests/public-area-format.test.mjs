import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
  const area = String(value ?? '').trim()
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
