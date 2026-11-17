// Renders the category artwork shown on job / listing cards that have no photo
// of their own: a flat icon centred on the category's tint.
//
//   node scripts/render-category-art.mjs
//
// Writes <name>.png to assets/categories/ (app) and to public/images/ in
// provider-web and public-web. The category → <name> map is in
// shared/categoryArtwork.ts. Edit an icon here, re-run, and commit the PNGs.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../package.json', import.meta.url))
const sharp = require('sharp')

const W = 960, H = 720, ICON = 240

// Each icon is drawn on a 48×48 grid in its colour (`fg`); TILE marks cut-outs
// painted in the background colour.
const ART = {
  fencing: { bg: '#d1fae5', fg: '#4f7d3b', svg: `<path d="M7 13l3-4 3 4v27H7zM21 13l3-4 3 4v27h-6zM35 13l3-4 3 4v27h-6z"/><rect x="12" y="17" width="24" height="4"/><rect x="12" y="28" width="24" height="4"/><rect x="3" y="40" width="42" height="3" rx="1.5"/>` },
  animals: { bg: '#fef3c7', fg: '#d97706', svg: `<circle cx="19" cy="18" r="6"/><circle cx="27" cy="16" r="6"/><circle cx="35" cy="19" r="6"/><circle cx="38" cy="27" r="5"/><circle cx="33" cy="32" r="5"/><circle cx="23" cy="32" r="5"/><circle cx="17" cy="27" r="6"/><rect x="18" y="18" width="18" height="14"/><rect x="19" y="34" width="3" height="8" rx="1.5"/><rect x="31" y="34" width="3" height="8" rx="1.5"/><ellipse cx="10" cy="22" rx="5" ry="6.5"/><ellipse cx="7" cy="16" rx="3" ry="1.6" transform="rotate(-25 7 16)"/><circle cx="9" cy="21" r="1.2" fill="TILE"/>` },
  water: { bg: '#ccfbf1', fg: '#00897b', svg: `<path d="M8 14c0-3.5 7-6 15-6s15 2.5 15 6v24a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z"/><path d="M8 21h30M8 28h30M8 35h30" stroke="TILE" stroke-width="2"/><rect x="38" y="31" width="6" height="3" rx="1"/><path d="M42 37c0 0-2 3-2 4.5a2 2 0 0 0 4 0C44 40 42 37 42 37z"/>` },
  spraying: { bg: '#e0f2fe', fg: '#0277bd', svg: `<rect x="5" y="18" width="15" height="23" rx="4"/><rect x="9" y="14" width="7" height="5" rx="1.5"/><path d="M19 24c6-1 8-6 13-11" fill="none" stroke="FG" stroke-width="3" stroke-linecap="round"/><path d="M30 11l5-4 3 3-4 5z"/><circle cx="41" cy="6" r="1.8"/><circle cx="43" cy="12" r="1.8"/><circle cx="40" cy="17" r="1.8"/><circle cx="45" cy="18" r="1.4"/><circle cx="45" cy="5" r="1.4"/>` },
  land: { bg: '#dcfce7', fg: '#388e3c', svg: `<circle cx="24" cy="16" r="10"/><circle cx="15" cy="22" r="7.5"/><circle cx="33" cy="22" r="7.5"/><circle cx="24" cy="25" r="7"/><rect x="22" y="26" width="4" height="13"/><path d="M4 42c4-5 6-5 8-1 2-6 5-6 7 0 2-3 4-3 6 0 3-5 5-5 7 0 2-4 5-4 7 0 2-3 3-3 5 1z"/>` },
  cropping: { bg: '#fef9c3', fg: '#b7791f', svg: `<rect x="18" y="12" width="22" height="28"/><ellipse cx="40" cy="26" rx="5" ry="14"/><circle cx="18" cy="26" r="14"/><circle cx="18" cy="26" r="10" fill="none" stroke="TILE" stroke-width="1.8"/><circle cx="18" cy="26" r="5.5" fill="none" stroke="TILE" stroke-width="1.8"/><circle cx="18" cy="26" r="1.6" fill="TILE"/><rect x="2" y="40" width="44" height="3" rx="1.5"/>` },
  earthworks: { bg: '#efe3d0', fg: '#8a5a2b', svg: `<rect x="3" y="34" width="26" height="8" rx="4"/><circle cx="8" cy="38" r="1.6" fill="TILE"/><circle cx="16" cy="38" r="1.6" fill="TILE"/><circle cx="24" cy="38" r="1.6" fill="TILE"/><rect x="6" y="25" width="20" height="8" rx="1.5"/><path d="M8 25v-10h10l3 10z"/><path d="M10 23v-6h6l2 6z" fill="TILE"/><path d="M24 27L34 11l9 11" fill="none" stroke="FG" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><path d="M40 21l6 4-2 9h-8z"/>` },
  machinery: { bg: '#ede9fe', fg: '#6d4cb5', svg: `<path d="M9 9h15l2 13H9z"/><path d="M12 12h9l1 8H12z" fill="TILE"/><rect x="9" y="21" width="32" height="10" rx="2"/><rect x="33" y="12" width="3" height="10" rx="1"/><circle cx="15" cy="33" r="10"/><circle cx="15" cy="33" r="4" fill="TILE"/><circle cx="37" cy="36" r="7"/><circle cx="37" cy="36" r="2.5" fill="TILE"/>` },
  buildings: { bg: '#ffedd5', fg: '#e67700', svg: `<path d="M5 22l6-10 13-6 13 6 6 10v20H5z"/><rect x="15" y="25" width="18" height="17" fill="TILE"/><path d="M15 25l18 17M33 25L15 42" stroke="FG" stroke-width="2.5"/><rect x="15" y="25" width="18" height="17" fill="none" stroke="FG" stroke-width="2.5"/><rect x="20" y="13" width="8" height="7" rx="1" fill="TILE"/>` },
  transport: { bg: '#dbeafe', fg: '#1565c0', svg: `<rect x="3" y="12" width="26" height="22" rx="2"/><path d="M5 18h22M5 23h22M5 28h22" stroke="TILE" stroke-width="1.8"/><path d="M30 18h7l7 9v7H30z"/><path d="M33 21h3l4 6h-7z" fill="TILE"/><circle cx="12" cy="36" r="5"/><circle cx="12" cy="36" r="2" fill="TILE"/><circle cx="36" cy="36" r="5"/><circle cx="36" cy="36" r="2" fill="TILE"/>` },
  property: { bg: '#e8f0fe', fg: '#3b6ea5', svg: `<path d="M24 6l19 16h-5v19H10V22H5z"/><rect x="32" y="8" width="4" height="9"/><path d="M20 41V30a4 4 0 0 1 8 0v11z" fill="TILE"/><rect x="13" y="25" width="5" height="5" rx="0.8" fill="TILE"/><rect x="30" y="25" width="5" height="5" rx="0.8" fill="TILE"/>` },
  general: { bg: '#f3f4f6', fg: '#546e7a', svg: `<path d="M13 5h14v23l10 3c4 1 6 3.5 6 7v3H13z"/><rect x="12" y="4" width="16" height="4" rx="1.5"/><path d="M13 36h30" stroke="TILE" stroke-width="2"/><rect x="11" y="41" width="33" height="3" rx="1.5"/>` },
  // Listing kinds (grazing, hire, lease, for sale) — their own category sets.
  grazing: { bg: '#dcfce7', fg: '#2d6a4f', svg: `<rect x="8" y="16" width="27" height="15" rx="5"/><rect x="33" y="11" width="10" height="12" rx="3.5"/><path d="M33 12l-3-4M43 12l2-4" stroke="FG" stroke-width="2.5" stroke-linecap="round"/><rect x="10" y="29" width="3.5" height="11" rx="1.5"/><rect x="29" y="29" width="3.5" height="11" rx="1.5"/><path d="M8 19c-3 2-4 6-3 10" fill="none" stroke="FG" stroke-width="2" stroke-linecap="round"/><ellipse cx="18" cy="22" rx="4" ry="3" fill="TILE"/><ellipse cx="27" cy="26" rx="3" ry="2.2" fill="TILE"/><path d="M2 43c3-4 5-4 7 0 2-4 4-4 6 0M30 43c3-4 5-4 7 0 2-4 4-4 6 0" fill="none" stroke="FG" stroke-width="2" stroke-linecap="round"/>` },
  hire: { bg: '#ede9fe', fg: '#6d4cb5', svg: `<rect x="4" y="18" width="28" height="14" rx="2"/><path d="M4 22h28" stroke="TILE" stroke-width="1.8"/><path d="M32 29h11" stroke="FG" stroke-width="3" stroke-linecap="round"/><circle cx="44" cy="29" r="2.5"/><circle cx="18" cy="35" r="6"/><circle cx="18" cy="35" r="2.3" fill="TILE"/>` },
  lease: { bg: '#e0f2fe', fg: '#0f6e8c', svg: `<circle cx="15" cy="24" r="10"/><circle cx="12" cy="24" r="3.5" fill="TILE"/><rect x="23" y="21.5" width="21" height="5" rx="1.5"/><rect x="35" y="26" width="4" height="7" rx="1"/><rect x="41" y="26" width="3" height="5" rx="1"/>` },
  'for-sale': { bg: '#fef3c7', fg: '#b45309', svg: `<path d="M6 8a2 2 0 0 1 2-2h16l18 18a2 2 0 0 1 0 2.8L27 41.8a2 2 0 0 1-2.8 0L6 24z"/><circle cx="14" cy="14" r="3.5" fill="TILE"/><path d="M20 26l8-8M23 31l8-8" stroke="TILE" stroke-width="2.5" stroke-linecap="round"/>` },
}

const OUT = ['assets/categories', 'provider-web/public/images', 'public-web/public/images']
const root = fileURLToPath(new URL('../', import.meta.url))
// Optional: write to one other folder instead (e.g. to preview changes).
const dirs = process.argv[2] ? [resolve(process.argv[2])] : OUT.map(dir => join(root, dir))

for (const [name, { bg, fg, svg }] of Object.entries(ART)) {
  const s = ICON / 48
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${bg}"/>`
    + `<g transform="translate(${(W - ICON) / 2} ${(H - ICON) / 2}) scale(${s})" fill="${fg}">`
    + svg.replaceAll('TILE', bg).replaceAll('FG', fg) + `</g></svg>`
  const png = await sharp(Buffer.from(doc)).png({ compressionLevel: 9, palette: true }).toBuffer()
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true })
    await sharp(png).toFile(join(dir, name + '.png'))
  }
  console.log(name, png.length, 'bytes')
}
