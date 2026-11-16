import type { SupabaseClient } from '@supabase/supabase-js'
import { THUMB_MAX, THUMB_QUALITY, thumbPath } from '@shared/photos'
import { resizePhoto } from '@/lib/resize-photo'

// Card thumbnails for listing and job photos (see shared/photos.ts): a 400px
// JPEG uploaded next to the full photo as "<name>_thumb.jpg". A thumbnail is a
// nice-to-have — every failure here is swallowed and never blocks a save; cards
// fall back to the full photo when there is no thumbnail.

// Upload the thumbnail for a photo just stored at `path` in `bucket`.
// Resolves true when it was saved, false otherwise (never throws).
export async function uploadThumbnail(client: SupabaseClient, bucket: string, path: string, photo: Blob) {
  try {
    const target = thumbPath(path)
    if (!target) return false
    const thumb = await resizePhoto(photo, THUMB_MAX, THUMB_QUALITY, { reencode: true })
    const { error } = await client.storage.from(bucket).upload(target, thumb, { contentType: 'image/jpeg', upsert: true })
    return !error
  } catch {
    return false
  }
}

// Delete thumbnails of photos removed in an edit. Missing objects are fine.
export async function removeThumbnails(client: SupabaseClient, bucket: string, paths: string[]) {
  if (!paths.length) return
  try { await client.storage.from(bucket).remove(paths) } catch { /* not found / offline: ignore */ }
}
