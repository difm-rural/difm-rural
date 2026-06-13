import { supabase } from './supabase'

// Decodes a base64 image string to an ArrayBuffer for Supabase storage upload.
function base64ToArrayBuffer(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/=+$/, '')
  const bytes = []; let buffer = 0; let bits = 0
  for (let i = 0; i < clean.length; i++) {
    const value = chars.indexOf(clean[i])
    if (value < 0) continue
    buffer = (buffer << 6) | value; bits += 6
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff) }
  }
  return new Uint8Array(bytes).buffer
}

export function getPhotoUri(photo) {
  return typeof photo === 'string' ? photo : photo?.uri
}

export function isRemotePhoto(photo) {
  return typeof photo === 'string' && photo.startsWith('http')
}

// Photos for AsyncStorage (guest drafts): keep uri/fileName/mimeType, drop the
// large base64 blob — the local file:// uri stays valid within the session.
export function toStorablePhoto(photo) {
  if (typeof photo === 'string') return photo
  return { uri: photo?.uri, fileName: photo?.fileName, mimeType: photo?.mimeType }
}

// Uploads any local photos to the job-photos bucket and returns the full list
// of public URLs (already-remote photos are passed through unchanged).
export async function uploadJobPhotos(jobId, photos = []) {
  const localPhotos = photos.filter(p => !isRemotePhoto(p))
  const urls = photos.filter(isRemotePhoto)
  for (let i = 0; i < localPhotos.length; i++) {
    try {
      const photo    = localPhotos[i]
      const uri      = getPhotoUri(photo)
      if (!uri) continue
      const mimeType = typeof photo === 'string' ? 'image/jpeg' : (photo.mimeType || 'image/jpeg')
      const ext      = (photo.fileName || uri)?.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
      const path     = `${jobId}/${Date.now()}_${i}.${ext}`
      const fileData = photo.base64
        ? base64ToArrayBuffer(photo.base64)
        : await (await fetch(uri)).arrayBuffer()
      const { error } = await supabase.storage
        .from('job-photos')
        .upload(path, fileData, { contentType: mimeType, upsert: false })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('job-photos').getPublicUrl(path)
        urls.push(publicUrl)
      }
    } catch { /* skip failed photo */ }
  }
  return urls
}
