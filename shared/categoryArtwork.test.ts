// Run with: npm test   (whole suite), or on its own:
//   node --import ./tests/support/ts-resolve.mjs shared/categoryArtwork.test.ts
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { categoryArtwork, categoryArtworkName } from './categoryArtwork.ts'
import { CATEGORIES, LISTING_CATEGORIES } from './categories.ts'

let passed = 0
function check(name: string, got: unknown, expected: unknown) {
  assert.deepEqual(got, expected, `${name}\n  got:      ${JSON.stringify(got)}\n  expected: ${JSON.stringify(expected)}`)
  passed++
}

const root = new URL('../', import.meta.url)
const KIND_ART: Record<string, string> = { grazing: 'grazing', hire: 'hire', lease: 'lease', for_sale: 'for-sale' }

// Every service category has its own picture (only General Rural Help is the gumboot).
for (const category of CATEGORIES) {
  const name = categoryArtworkName(category)
  check(`${category} · own picture`, name === 'general', category === 'General Rural Help')
}
check('service categories · all different', new Set(CATEGORIES.map(categoryArtworkName)).size, CATEGORIES.length)

// Listing kinds: every category of a kind shows that kind's picture.
for (const [kind, categories] of Object.entries(LISTING_CATEGORIES)) {
  if (kind === 'service') continue
  for (const category of categories) check(`${kind} · ${category}`, categoryArtworkName(category), KIND_ART[kind])
}

check('case and spaces ignored', categoryArtworkName('  FENCING & GATES '), 'fencing')
check('unknown → general', [categoryArtworkName('Something else'), categoryArtworkName(null), categoryArtworkName(undefined), categoryArtworkName('')], ['general', 'general', 'general', 'general'])
check('web path', categoryArtwork('Water & Drainage'), '/images/water.png')

// Every picture exists for the app and both web apps.
const names = new Set([...CATEGORIES, ...Object.values(LISTING_CATEGORIES).flat()].map(categoryArtworkName))
for (const dir of ['assets/categories', 'provider-web/public/images', 'public-web/public/images']) {
  for (const name of names) check(`${dir}/${name}.png exists`, existsSync(new URL(`${dir}/${name}.png`, root)), true)
}

// The app requires every picture (static require() table).
const app = readFileSync(new URL('src/lib/categoryImages.js', root), 'utf8')
for (const name of names) check(`app requires ${name}.png`, app.includes(`assets/categories/${name}.png'`), true)

console.log(`categoryArtwork: ${passed} checks passed`)
