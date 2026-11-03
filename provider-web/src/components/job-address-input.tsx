'use client'

import {useEffect, useState} from 'react'

type Suggestion = {description: string; place_id: string}
const proxy = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/maps-proxy'

export function JobAddressInput({value, onChange}: {
  value: string
  onChange: (address: string, latitude?: number, longitude?: number) => void
}) {
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Suggestion | null>(null)

  useEffect(() => {
    if (search.trim().length < 3) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(proxy + '/places-autocomplete', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({input: search.trim()}),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        })
        if (!response.ok) throw new Error()
        const {suggestions: results} = await response.json()
        if (controller.signal.aborted) return
        setSuggestions(results ?? [])
        setMessage(results?.length ? '' : 'No matching addresses. You can enter the address manually.')
      } catch {
        if (!controller.signal.aborted) setMessage('Address suggestions are unavailable. You can enter the address manually.')
      }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [search])

  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    async function locate(place: Suggestion) {
      try {
        const response = await fetch(proxy + '/place-details?place_id=' + encodeURIComponent(place.place_id), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        })
        if (!response.ok) throw new Error()
        const {latitude, longitude} = await response.json()
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error()
        if (!controller.signal.aborted) {
          onChange(place.description, latitude, longitude)
          setMessage('')
        }
      } catch {
        if (!controller.signal.aborted) setMessage('Could not place a pin for this address. You can place it on the map.')
      }
    }
    void locate(selected)
    return () => controller.abort()
  }, [selected, onChange])

  return <div className="lform-field">
    <label htmlFor="job-exact-address">Exact property location (optional)</label>
    <input id="job-exact-address" maxLength={300} value={value} autoComplete="off"
      placeholder="Search for a New Zealand address"
      onChange={event => {
        setSelected(null)
        setSuggestions([])
        setMessage('')
        setSearch(event.target.value)
        onChange(event.target.value)
      }}
    />
    {suggestions.length > 0 && <ul aria-label="Address suggestions">
      {suggestions.map(place => <li key={place.place_id}>
        <button type="button" className="lform-cancel" onClick={() => {
          setSearch('')
          setSuggestions([])
          setMessage('Locating address…')
          onChange(place.description)
          setSelected(place)
        }}>{place.description}</button>
      </li>)}
    </ul>}
    {message && <small className="muted" role="status">{message}</small>}
  </div>
}
