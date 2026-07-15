import * as Location from 'expo-location'
import { MAPS_PROXY_URL } from './constants'

// Google returns an Open Location Code ("plus code", e.g. "452X+2X Momona,
// Otago Region") as the formatted_address whenever a rural point has no
// registered street address. The code token reads like raw coordinates, so we
// strip it and keep the human-readable locality that follows.
export function stripPlusCode(address) {
  if (!address) return address
  const cleaned = String(address)
    .replace(/\b[A-Z0-9]{4,6}\+[A-Z0-9]{2,3}\b[\s,]*/gi, '')
    .replace(/^[\s,]+/, '')
    .trim()
  return cleaned
}

export async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(`${MAPS_PROXY_URL}/geocode?lat=${lat}&lng=${lng}`)
    const data = await res.json()
    const address = stripPlusCode(data.address)
    // A real locality survives stripping; a bare plus code (or a failed lookup)
    // does not — return null rather than dumping raw coordinates as the address.
    return address || null
  } catch {
    return null
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
  let parts = stripPlusCode(String(address)).split(',').map(s => s.trim()).filter(Boolean)
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
