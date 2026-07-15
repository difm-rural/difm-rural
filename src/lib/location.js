import * as Location from 'expo-location'
import { MAPS_PROXY_URL } from './constants'

export async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(`${MAPS_PROXY_URL}/geocode?lat=${lat}&lng=${lng}`)
    const data = await res.json()
    if (data.address) return data.address
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

export async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') return null
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
  return loc.coords
}

// Coarse "suburb / town + postcode" from a full address, dropping the street
// line and a trailing country. e.g.
//   "165 Ireland Road, Waitoki 0871, New Zealand" -> "Waitoki 0871"
export function coarseSuburb(address) {
  if (!address) return ''
  let parts = String(address).split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length && /new zealand|aotearoa|^nz$/i.test(parts[parts.length - 1])) parts = parts.slice(0, -1)
  return parts.length ? parts[parts.length - 1] : ''
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
