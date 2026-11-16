// Photo upload sizes (longest side, in pixels) — the same as the app.
export const PHOTO_MAX = 1600   // job, listing and chat photos
export const AVATAR_MAX = 512   // profile photos

// Scale a chosen photo down in the browser so its longest side is at most `max`
// pixels, as a JPEG. Faster to upload on rural connections and quicker to load
// for everyone browsing. The result is a JPEG: a photo that is already a small
// JPEG is returned unchanged (unless `reencode`, e.g. to apply a lower quality
// for a thumbnail), anything else is re-encoded. If the browser cannot decode
// it, the original is returned.
export async function resizePhoto(file: Blob, max = PHOTO_MAX, quality = 0.85, { reencode = false }: { reencode?: boolean } = {}): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.type === 'image/jpeg' && !reencode) { bitmap.close(); return file }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) { bitmap.close(); return file }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', quality))
  } catch {
    return file
  }
}
