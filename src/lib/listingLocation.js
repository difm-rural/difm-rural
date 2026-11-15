import { nearbyPoint } from './nearbyBrowsing.js'
import { createPublicAreaCache, lookupPublicArea } from '../../shared/publicJobArea'
import { MAPS_PROXY_URL } from './constants'

// A listing with no map pin is left out of nearby searches. When the provider
// typed a place instead of picking a suggestion, find its pin from the text.
// Resolves to { latitude, longitude } or null (never throws).
export const lookUpListingPin = createPublicAreaCache(area => lookupPublicArea(MAPS_PROXY_URL, area))
export function existingListingPin(listing) {
  return nearbyPoint(listing?.latitude, listing?.longitude) || nearbyPoint(listing?.service_latitude, listing?.service_longitude)
}
export function listingLocationFields(pin) {
  const point = nearbyPoint(pin?.latitude, pin?.longitude)
  return { latitude: point?.latitude ?? null, longitude: point?.longitude ?? null, service_latitude: point?.latitude ?? null, service_longitude: point?.longitude ?? null }
}
