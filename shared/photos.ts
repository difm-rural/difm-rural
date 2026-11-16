// Photo thumbnails for cards. Shared by the mobile app and provider-web.
//
// Listing and job photos are uploaded twice: the full image (longest side at
// most 1600px) and a small JPEG thumbnail at the same path with "_thumb" before
// the extension — e.g. job-photos/<job>/<file>.jpg and .../<file>_thumb.jpg.
// Cards and lists show the thumbnail; detail pages and galleries show the full
// image. Photos uploaded before thumbnails existed have none, so a card falls
// back to the full image once if the thumbnail fails to load.

export const THUMB_MAX = 400       // longest side, px
export const THUMB_QUALITY = 0.75  // JPEG quality

// ".../abc.jpg" → ".../abc_thumb.jpg". Null when there is no extension or the
// path is already a thumbnail.
export function thumbPath(path: string): string | null {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  if (dot <= slash + 1) return null
  const stem = path.slice(0, dot)
  if (stem.endsWith('_thumb')) return null
  return stem + '_thumb' + path.slice(dot)
}

// The thumbnail URL for an uploaded photo; any query (e.g. ?t=cache-buster) or
// hash is kept. Anything that isn't an http(s) URL with a file extension — a
// local blob: preview, bundled artwork, an unknown address — is returned as is.
export function thumbUrl(url: string | null | undefined): string {
  const value = String(url ?? '')
  if (!/^https?:\/\//i.test(value)) return value
  const cut = value.search(/[?#]/)
  const base = cut < 0 ? value : value.slice(0, cut)
  const rest = cut < 0 ? '' : value.slice(cut)
  const thumb = thumbPath(base)
  return thumb ? thumb + rest : value
}

// The image fallback rule for cards: show the thumbnail first; if it fails,
// switch to the full image once; if that fails too, stop (null) — never loop.
export function fallbackImageSrc(current: string, full: string): string | null {
  return current !== full ? full : null
}

// "https://x.supabase.co/storage/v1/object/public/job-photos/a/b.jpg?t=1" →
// "a/b.jpg" for that bucket; null for anything else.
export function storagePathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  const value = String(url ?? '')
  const marker = '/storage/v1/object/public/' + bucket + '/'
  const at = value.indexOf(marker)
  if (at < 0) return null
  const path = value.slice(at + marker.length).split(/[?#]/)[0]
  try { return decodeURIComponent(path) || null } catch { return path || null }
}

// The storage paths of the thumbnails to delete when photos are removed from a
// listing or job: those in `before` but no longer in `after`.
export function removedThumbPaths(before: unknown, after: unknown, bucket: string): string[] {
  const kept = new Set((Array.isArray(after) ? after : []).filter(p => typeof p === 'string'))
  const paths = (Array.isArray(before) ? before : [])
    .filter((p): p is string => typeof p === 'string' && !kept.has(p))
    .map(url => storagePathFromPublicUrl(url, bucket))
    .map(path => (path ? thumbPath(path) : null))
    .filter((path): path is string => !!path)
  return [...new Set(paths)]
}
