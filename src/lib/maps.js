import { MAPS_PROXY_URL } from './constants'

export function staticMapUrl(lat, lng, { zoom = 14, width = 600, height = 240 } = {}) {
  return `${MAPS_PROXY_URL}/staticmap?lat=${lat}&lng=${lng}&zoom=${zoom}&w=${width}&h=${height}`
}

export function staticMapPolygonUrl(points, { zoom = 14, width = 600, height = 240 } = {}) {
  if (!points?.length) return ''
  const path = encodeURIComponent(points.map(p => `${p.latitude},${p.longitude}`).join('|'))
  return `${MAPS_PROXY_URL}/staticmap?path=${path}&zoom=${zoom}&w=${width}&h=${height}`
}

export async function placesAutocomplete(input) {
  const res = await fetch(`${MAPS_PROXY_URL}/places-autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const data = await res.json()
  return data.suggestions || []
}

export async function placeDetails(placeId) {
  const res = await fetch(`${MAPS_PROXY_URL}/place-details?place_id=${encodeURIComponent(placeId)}`)
  return await res.json()
}
