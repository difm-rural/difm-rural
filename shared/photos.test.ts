// Run with: npm test   (whole suite), or on its own:
//   node --import ./tests/support/ts-resolve.mjs shared/photos.test.ts
import assert from 'node:assert/strict'
import { fallbackImageSrc, removedThumbPaths, storagePathFromPublicUrl, thumbPath, thumbUrl, THUMB_MAX, THUMB_QUALITY } from './photos.ts'

let passed = 0
function check(name: string, got: unknown, expected: unknown) {
  assert.deepEqual(got, expected, `${name}\n  got:      ${JSON.stringify(got)}\n  expected: ${JSON.stringify(expected)}`)
  passed++
}

const base = 'https://opagkgfxmjqmnvhrcris.supabase.co/storage/v1/object/public'

// ---- thumbUrl ----
check('thumbUrl · listing photo', thumbUrl(`${base}/service-photos/svc/1700_0.jpg`), `${base}/service-photos/svc/1700_0_thumb.jpg`)
check('thumbUrl · web job photo path', thumbUrl(`${base}/job-photos/job/user/abc-123.jpg`), `${base}/job-photos/job/user/abc-123_thumb.jpg`)
check('thumbUrl · other extensions', thumbUrl(`${base}/service-photos/svc/a.png`), `${base}/service-photos/svc/a_thumb.png`)
check('thumbUrl · keeps the query', thumbUrl(`${base}/job-photos/j/a.jpg?t=123`), `${base}/job-photos/j/a_thumb.jpg?t=123`)
check('thumbUrl · keeps a hash', thumbUrl(`${base}/job-photos/j/a.jpg#x`), `${base}/job-photos/j/a_thumb.jpg#x`)
check('thumbUrl · a dot in a folder name is not the extension', thumbUrl('https://x.test/a.b/photo'), 'https://x.test/a.b/photo')
check('thumbUrl · already a thumbnail', thumbUrl(`${base}/job-photos/j/a_thumb.jpg`), `${base}/job-photos/j/a_thumb.jpg`)
check('thumbUrl · blob preview unchanged', thumbUrl('blob:http://localhost:3100/abc'), 'blob:http://localhost:3100/abc')
check('thumbUrl · local file unchanged', thumbUrl('file:///data/photo.jpg'), 'file:///data/photo.jpg')
check('thumbUrl · relative artwork unchanged', thumbUrl('/categories/fencing.jpg'), '/categories/fencing.jpg')
check('thumbUrl · empty', [thumbUrl(null), thumbUrl(undefined), thumbUrl('')], ['', '', ''])
check('thumbPath', [thumbPath('a/b.jpg'), thumbPath('a/b'), thumbPath('a/.hidden'), thumbPath('b.jpeg')], ['a/b_thumb.jpg', null, null, 'b_thumb.jpeg'])
check('thumbnail size + quality', [THUMB_MAX, THUMB_QUALITY], [400, 0.75])

// ---- Fallback: thumbnail → full image once → stop ----
const full = `${base}/job-photos/j/a.jpg`
let src: string | null = thumbUrl(full)
const shown: (string | null)[] = [src]
for (let failures = 0; failures < 5 && src; failures++) { src = fallbackImageSrc(src, full); shown.push(src) }
check('fallback · thumbnail, then the full image, then stop', shown, [`${base}/job-photos/j/a_thumb.jpg`, full, null])
check('fallback · a photo with no thumbnail form never loops', fallbackImageSrc('blob:x', 'blob:x'), null)

// ---- Deleting thumbnails of removed photos ----
check('storage path · from a public URL', storagePathFromPublicUrl(`${base}/service-photos/svc/a%20b.jpg?t=1`, 'service-photos'), 'svc/a b.jpg')
check('storage path · wrong bucket', storagePathFromPublicUrl(`${base}/job-photos/j/a.jpg`, 'service-photos'), null)
check('storage path · not a storage URL', storagePathFromPublicUrl('https://example.com/a.jpg', 'job-photos'), null)
check('removed thumbs · only photos no longer kept',
  removedThumbPaths([`${base}/job-photos/j/a.jpg`, `${base}/job-photos/j/b.jpg`, `${base}/job-photos/j/c.jpg`], [`${base}/job-photos/j/b.jpg`], 'job-photos'),
  ['j/a_thumb.jpg', 'j/c_thumb.jpg'])
check('removed thumbs · nothing removed', removedThumbPaths([`${base}/job-photos/j/a.jpg`], [`${base}/job-photos/j/a.jpg`, `${base}/job-photos/j/new.jpg`], 'job-photos'), [])
check('removed thumbs · other buckets and odd values ignored',
  removedThumbPaths([`${base}/service-photos/s/a.jpg`, 'https://example.com/x.jpg', null, 5], [], 'job-photos'), [])
check('removed thumbs · no list', removedThumbPaths(null, undefined, 'job-photos'), [])

console.log(`\n✅ photos: all ${passed} cases passed`)
