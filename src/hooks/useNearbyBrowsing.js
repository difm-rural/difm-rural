import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useUser } from '../context/UserContext'
import { getCurrentLocation } from '../lib/location'
import { MAPS_PROXY_URL } from '../lib/constants'
import { createNearbyStore, defaultNearby, nearbyPoint, DEFAULT_RADIUS } from '../lib/nearbyBrowsing'

const store = createNearbyStore(AsyncStorage)
async function currentLocationWithTimeout() {
  let timer
  try { return await Promise.race([getCurrentLocation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Location is taking too long. Try again outside, or choose a town instead.')), 20000) })]) }
  finally { clearTimeout(timer) }
}
async function mapsRequest(route, options) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(MAPS_PROXY_URL + route, { ...options, signal: controller.signal })
    if (!response.ok) throw new Error('Location search is unavailable. Check your connection and try again.')
    return await response.json()
  } finally { clearTimeout(timer) }
}
export default function useNearbyBrowsing() {
  const { profile } = useUser(), scope = profile?.id || 'guest'
  const [preference, setPreference] = useState(() => defaultNearby(profile)), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const scopeRef = useRef(scope), busyRef = useRef(false), valueRef = useRef(preference), aliveRef = useRef(true)
  scopeRef.current = scope; valueRef.current = preference
  useEffect(() => { aliveRef.current = true; const unsubscribe = store.subscribe(scope, setPreference); return () => { aliveRef.current = false; unsubscribe() } }, [scope])
  useFocusEffect(useCallback(() => {
    let active = true
    setPreference(defaultNearby(profile))
    store.load(scope).then(value => { if (active && value) setPreference(value) }).catch(() => { if (active) setError('Could not restore your browsing location. Choose it again.') })
    return () => { active = false }
  }, [scope, profile?.latitude, profile?.longitude, profile?.region]))

  async function run(action) {
    if (busyRef.current) return false
    const startedScope = scopeRef.current
    busyRef.current = true; setBusy(true); setError('')
    try {
      const value = await action()
      if (!aliveRef.current || scopeRef.current !== startedScope) return false
      if (value) {
        const saved = await store.save(startedScope, value)
        if (!aliveRef.current || scopeRef.current !== startedScope) return false
        setPreference(saved)
      }
      return true
    } catch (e) { if (aliveRef.current) setError(e?.message || 'Could not update your browsing location. Try again.'); return false }
    finally { busyRef.current = false; if (aliveRef.current) setBusy(false) }
  }
  return {
    ...preference, busy, error, clearError: () => setError(''),
    setRadius: radius => run(async () => ({ ...valueRef.current, radius })),
    clearLocation: () => run(async () => ({ point: null, label: '', radius: DEFAULT_RADIUS })),
    useCurrentLocation: () => run(async () => {
      const coords = await currentLocationWithTimeout(), point = nearbyPoint(coords?.latitude, coords?.longitude)
      if (!point) throw new Error('Could not get your location. Allow location access in Settings, or choose a town instead.')
      return { ...valueRef.current, point, label: 'Your current location', radius: valueRef.current.radius ?? DEFAULT_RADIUS }
    }),
    async findTowns(query) {
      if (query.trim().length < 2) throw new Error('Enter a town or suburb to search.')
      const data = await mapsRequest('/places-autocomplete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: query.trim().slice(0, 120) }) })
      return (data.suggestions || []).slice(0, 5)
    },
    chooseTown: prediction => run(async () => {
      const data = await mapsRequest('/place-details?place_id=' + encodeURIComponent(prediction.place_id))
      const point = nearbyPoint(data.latitude, data.longitude)
      if (!point) throw new Error('Could not locate that town. Search again or use your current location.')
      return { ...valueRef.current, point, label: prediction.description, radius: valueRef.current.radius ?? DEFAULT_RADIUS }
    }),
  }
}
