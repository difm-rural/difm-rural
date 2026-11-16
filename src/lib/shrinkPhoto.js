import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'

// Phone cameras produce photos far larger than a listing card needs. Scale a
// picked photo down so its longest side is at most `max` pixels before upload:
// faster to send on rural connections and quicker to load for everyone browsing.
// Returns an asset-shaped object ({ uri, base64, mimeType, fileName }). If the
// photo is already small, or resizing fails, the original asset is returned.
export async function shrinkPhoto(asset, max = 1600) {
  const width = Number(asset?.width) || 0
  const height = Number(asset?.height) || 0
  if (!asset?.uri || Math.max(width, height) <= max) return asset
  try {
    const resized = await manipulateAsync(
      asset.uri,
      [{ resize: width >= height ? { width: max } : { height: max } }],
      { compress: 0.8, format: SaveFormat.JPEG, base64: true },
    )
    const name = String(asset.fileName || 'photo').replace(/\.[^.]+$/, '')
    return { ...asset, uri: resized.uri, base64: resized.base64 || null, mimeType: 'image/jpeg', fileName: `${name}.jpg`, width: resized.width, height: resized.height }
  } catch {
    return asset
  }
}
