export const NEARBY_RADII = [10, 25, 50, 100, 200]
export const DEFAULT_RADIUS = 50
export const BROWSING_LIFETIME = 6 * 60 * 60 * 1000

export function nearbyPoint(latitude, longitude) {
  if (![latitude, longitude].every(value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '')) return null
  const lat = Number(latitude), lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng } : null
}
export function nearbyDistance(a, b) {
  const r = Math.PI / 180, x = (b.latitude - a.latitude) * r, y = (b.longitude - a.longitude) * r
  const h = Math.sin(x / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(y / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
}
export function defaultNearby(profile) {
  const point = nearbyPoint(profile?.latitude, profile?.longitude)
  return { point, label: point ? profile?.region || 'Your profile location' : '', radius: DEFAULT_RADIUS }
}
export function readNearby(raw, now = Date.now()) {
  try {
    const value = JSON.parse(raw)
    if (!Number.isFinite(value.expires) || value.expires <= now) return null
    return { point: nearbyPoint(value.point?.latitude, value.point?.longitude), label: String(value.label || '').slice(0, 120), radius: value.radius === null ? null : NEARBY_RADII.includes(value.radius) ? value.radius : DEFAULT_RADIUS }
  } catch { return null }
}
export function filterNearby(items, preference, sort = 'nearest') {
  const origin = preference.point, active = !!origin && preference.radius !== null
  const measured = items.map(item => {
    const pin = nearbyPoint(item.latitude, item.longitude) || nearbyPoint(item.discovery_latitude, item.discovery_longitude) || nearbyPoint(item.service_latitude, item.service_longitude)
    const distance = origin && pin ? nearbyDistance(origin, pin) : null
    return { item, distance }
  })
  const unlocated = measured.filter(row => row.distance === null).length
  const visible = measured.filter(row => !active || (row.distance !== null && row.distance <= preference.radius))
  const newest = (a, b) => (Date.parse(b.item.created_at) || 0) - (Date.parse(a.item.created_at) || 0)
  visible.sort((a, b) => origin && sort === 'nearest' ? (a.distance ?? Infinity) - (b.distance ?? Infinity) || newest(a, b) : newest(a, b))
  return { items: visible.map(({ item, distance }) => ({ ...item, _distanceKm: distance === null ? null : Number(distance.toFixed(1)) })), unlocated, active }
}
export function createNearbyStore(storage, now = Date.now) {
  const listeners = new Map()
  const key = scope => 'rural-nearby:' + (scope || 'guest')
  return {
    async load(scope) { return readNearby(await storage.getItem(key(scope)), now()) },
    async save(scope, value) {
      if (value.radius !== null && !NEARBY_RADII.includes(value.radius)) throw new Error('Choose a valid distance.')
      const p = nearbyPoint(value.point?.latitude, value.point?.longitude)
      if (value.point && !p) throw new Error('Choose a valid location.')
      const stored = { point: p ? { latitude: Number(p.latitude.toFixed(2)), longitude: Number(p.longitude.toFixed(2)) } : null, label: String(value.label || '').slice(0, 120), radius: value.radius, expires: now() + BROWSING_LIFETIME }
      await storage.setItem(key(scope), JSON.stringify(stored))
      const result = readNearby(JSON.stringify(stored), now())
      for (const listener of listeners.get(key(scope)) || []) listener(result)
      return result
    },
    subscribe(scope, listener) {
      const name = key(scope), set = listeners.get(name) || new Set()
      set.add(listener); listeners.set(name, set)
      return () => { set.delete(listener); if (!set.size) listeners.delete(name) }
    },
  }
}
