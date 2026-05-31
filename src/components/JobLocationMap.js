import React, { forwardRef, memo, useImperativeHandle, useRef } from 'react'
import { StyleSheet } from 'react-native'
import MapView, { Marker } from 'react-native-maps'

const NZ_CENTER  = { latitude: -41.2865, longitude: 174.7762 }
const INIT_DELTA = { latitudeDelta: 0.005, longitudeDelta: 0.005 }

const JobLocationMap = memo(forwardRef(function JobLocationMap(
  { latitude, longitude, mapType, onLocationSelect },
  ref
) {
  const mapViewRef = useRef(null)
  // Track current region in a ref so onRegionChangeComplete never triggers
  // a state update in the parent — this is the core fix for the re-render loop.
  const regionRef = useRef({
    latitude:  latitude  ?? NZ_CENTER.latitude,
    longitude: longitude ?? NZ_CENTER.longitude,
    ...INIT_DELTA,
  })

  useImperativeHandle(ref, () => ({
    animateToRegion(region, duration = 800) {
      regionRef.current = region
      mapViewRef.current?.animateToRegion(region, duration)
    },
    zoomIn() {
      const r = {
        ...regionRef.current,
        latitudeDelta:  Math.max(regionRef.current.latitudeDelta  / 2, 0.001),
        longitudeDelta: Math.max(regionRef.current.longitudeDelta / 2, 0.001),
      }
      regionRef.current = r
      mapViewRef.current?.animateToRegion(r, 200)
    },
    zoomOut() {
      const r = {
        ...regionRef.current,
        latitudeDelta:  Math.min(regionRef.current.latitudeDelta  * 2, 50),
        longitudeDelta: Math.min(regionRef.current.longitudeDelta * 2, 50),
      }
      regionRef.current = r
      mapViewRef.current?.animateToRegion(r, 200)
    },
  }))

  return (
    <MapView
      ref={mapViewRef}
      style={StyleSheet.absoluteFill}
      mapType={mapType}
      initialRegion={regionRef.current}
      showsUserLocation
      showsMyLocationButton={false}
      onRegionChangeComplete={(r) => { regionRef.current = r }}
      onPress={(e) => onLocationSelect(e.nativeEvent.coordinate)}>
      {latitude != null && longitude != null && (
        <Marker
          coordinate={{ latitude, longitude }}
          draggable
          onDragEnd={(e) => onLocationSelect(e.nativeEvent.coordinate)}
        />
      )}
    </MapView>
  )
}))

export default JobLocationMap
