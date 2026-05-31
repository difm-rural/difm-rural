import * as Location from 'expo-location'
import { GOOGLE_MAPS_API_KEY } from './constants'

export async function reverseGeocode(lat, lng) {
  try {
    const url  = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
    const res  = await fetch(url)
    const data = await res.json()
    if (data.results?.[0]) return data.results[0].formatted_address
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

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
