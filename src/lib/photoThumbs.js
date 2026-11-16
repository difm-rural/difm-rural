import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { THUMB_MAX, THUMB_QUALITY, thumbPath } from '../../shared/photos'

// Card thumbnails for listing and job photos (see shared/photos.ts): a 400px
// JPEG uploaded next to the full photo as "<name>_thumb.jpg". A thumbnail is a
// nice-to-have — every failure here is swallowed and never blocks a save; cards
// fall back to the full photo when there is no thumbnail.

// A local thumbnail file for a picked photo ({ uri, width?, height? }).
export async function photoThumbnail(photo) {
  const uri = typeof photo === 'string' ? photo : photo?.uri
  if (!uri) return null
  const width = Number(photo?.width) || 0
  const height = Number(photo?.height) || 0
  // Already small: just re-encode (never enlarge). Unknown size: cap the width.
  const actions = width && height && Math.max(width, height) <= THUMB_MAX
    ? []
    : [{ resize: height > width ? { height: THUMB_MAX } : { width: THUMB_MAX } }]
  const result = await manipulateAsync(uri, actions, { compress: THUMB_QUALITY, format: SaveFormat.JPEG })
  return result.uri
}

// Upload the thumbnail for a photo just stored at `path` in `bucket`.
// Resolves true when it was saved, false otherwise (never throws).
export async function uploadThumbnail(supabase, bucket, path, photo) {
  try {
    const target = thumbPath(path)
    if (!target) return false
    const uri = await photoThumbnail(photo)
    if (!uri) return false
    const data = await (await fetch(uri)).arrayBuffer()
    const { error } = await supabase.storage.from(bucket).upload(target, data, { contentType: 'image/jpeg', upsert: true })
    return !error
  } catch {
    return false
  }
}

// Delete thumbnails of photos removed in an edit. Missing objects are fine.
export async function removeThumbnails(supabase, bucket, paths) {
  if (!paths?.length) return
  try { await supabase.storage.from(bucket).remove(paths) } catch { /* not found / offline: ignore */ }
}
