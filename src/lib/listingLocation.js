import { nearbyPoint } from './nearbyBrowsing.js'
export function existingListingPin(listing) {
  return nearbyPoint(listing?.latitude, listing?.longitude) || nearbyPoint(listing?.service_latitude, listing?.service_longitude)
}
export function listingLocationFields(pin) {
  const point = nearbyPoint(pin?.latitude, pin?.longitude)
  return { latitude: point?.latitude ?? null, longitude: point?.longitude ?? null, service_latitude: point?.latitude ?? null, service_longitude: point?.longitude ?? null }
}
