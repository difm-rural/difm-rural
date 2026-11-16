// Scale a chosen photo down in the browser so its longest side is at most `max`
// pixels, as a JPEG. Faster to upload on rural connections and quicker to load
// for everyone browsing. A photo that is already a small JPEG, or one the
// browser cannot decode, is returned unchanged.
export async function resizePhoto(file: File, max = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.type === 'image/jpeg') { bitmap.close(); return file }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) { bitmap.close(); return file }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.85))
  } catch {
    return file
  }
}
