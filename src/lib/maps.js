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
  const data = await placesRequest('/places-autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  return data.suggestions || []
}

export async function placeDetails(placeId) {
  const data = await placesRequest(`/place-details?place_id=${encodeURIComponent(placeId)}`)
  if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number' || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) throw new Error('Could not locate this address. Choose another suggestion or enter the location manually.')
  return data
}

async function placesRequest(route, options) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(MAPS_PROXY_URL + route, { ...options, signal: controller.signal })
    if (!response.ok) throw new Error('Address search is unavailable. Try again or enter the location manually.')
    return await response.json()
  } finally { clearTimeout(timer) }
}
