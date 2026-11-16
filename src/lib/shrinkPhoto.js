import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'

// Photo upload sizes (longest side, in pixels). Phone cameras produce photos far
// larger than any card or chat bubble needs; smaller files upload faster on
// rural connections and load quicker for everyone.
export const PHOTO_MAX = 1600   // job, listing and chat photos
export const AVATAR_MAX = 512   // profile photos

// Scale a picked photo down so its longest side is at most `max` pixels, as a
// JPEG. Returns an asset-shaped object ({ uri, base64, mimeType, fileName,
// width, height }). A photo already within `max` is returned unchanged — unless
// `jpeg` is set, when it is re-encoded as JPEG anyway (for uploads stored as
// image/jpeg). If resizing fails, the original asset is returned.
export async function shrinkPhoto(asset, max = PHOTO_MAX, { jpeg = false } = {}) {
  const width = Number(asset?.width) || 0
  const height = Number(asset?.height) || 0
  if (!asset?.uri) return asset
  // A size of 0 means the picker didn't report it: don't guess (resizing could
  // enlarge a small photo) — only re-encode if asked.
  const tooBig = !!width && !!height && Math.max(width, height) > max
  if (!tooBig && !jpeg) return asset
  try {
    const actions = tooBig ? [{ resize: height > width ? { height: max } : { width: max } }] : []
    const resized = await manipulateAsync(asset.uri, actions, { compress: 0.8, format: SaveFormat.JPEG, base64: true })
    const name = String(asset.fileName || 'photo').replace(/\.[^.]+$/, '')
    return { ...asset, uri: resized.uri, base64: resized.base64 || null, mimeType: 'image/jpeg', fileName: `${name}.jpg`, width: resized.width, height: resized.height }
  } catch {
    return asset
  }
}
