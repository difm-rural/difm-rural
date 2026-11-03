'use client'

import Script from 'next/script'
import {useEffect, useRef, useState} from 'react'

type Point = {lat: number; lng: number}
type Listener = {remove(): void}
type MapView = {
  addListener(event: string, callback: (event: {latLng?: {toJSON(): Point}}) => void): Listener
  panTo(point: Point): void
  getZoom(): number | undefined
  setZoom(zoom: number): void
}
type Marker = {setMap(map: MapView | null): void; setPosition(point: Point): void}
type Maps = {
  Map: new (element: HTMLElement, options: object) => MapView
  Marker: new (options: object) => Marker
}

export function JobLocationMap({latitude, longitude, onPick}: {
  latitude: string
  longitude: string
  onPick: (point: Point) => void
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<MapView | null>(null)
  const marker = useRef<Marker | null>(null)
  const [maps, setMaps] = useState<Maps>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!maps || !element.current) return
    const view = new maps.Map(element.current, {
      center: {lat: -41.2, lng: 173.8},
      zoom: 5,
      fullscreenControl: false,
      streetViewControl: false,
    })
    const pin = new maps.Marker({title: 'Job location'})
    map.current = view
    marker.current = pin
    const listener = view.addListener('click', ({latLng}) => {
      if (latLng) onPick(latLng.toJSON())
    })
    return () => {
      listener.remove()
      pin.setMap(null)
      map.current = null
      marker.current = null
    }
  }, [maps, onPick])

  useEffect(() => {
    if (!map.current || !marker.current) return
    if (!latitude || !longitude) {
      marker.current.setMap(null)
      return
    }
    const point = {lat: Number(latitude), lng: Number(longitude)}
    marker.current.setPosition(point)
    marker.current.setMap(map.current)
    map.current.panTo(point)
    if ((map.current.getZoom() ?? 0) < 16) map.current.setZoom(16)
  }, [maps, latitude, longitude])

  if (!key || failed) return <p className="muted">Map unavailable. You can enter the address or use your location below.</p>

  return <div>
    <Script
      id="job-google-maps"
      src={'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key)}
      onReady={() => {
        const api = (window as Window & {google?: {maps?: Maps}}).google?.maps
        if (api?.Map) setMaps(api)
        else setFailed(true)
      }}
      onError={() => setFailed(true)}
    />
    <p className="muted">Zoom in and tap the map to place a pin at the job site.</p>
    <div ref={element} aria-label="Job location map" style={{height: 320, borderRadius: 12, overflow: 'hidden'}} />
  </div>
}
