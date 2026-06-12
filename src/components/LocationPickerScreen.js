import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/tokens'
import { reverseGeocode, getCurrentLocation } from '../lib/location'

const NZ_CENTER = { latitude: -41.2865, longitude: 174.7762 }

export default function LocationPickerScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const mapRef = useRef(null)

  const initLat  = route.params?.initialLatitude  || NZ_CENTER.latitude
  const initLng  = route.params?.initialLongitude || NZ_CENTER.longitude
  const hasInit  = !!route.params?.initialLatitude

  const [mapType,      setMapType]      = useState('hybrid')
  const [pinLocation,  setPinLocation]  = useState(hasInit ? { latitude: initLat, longitude: initLng } : null)
  const [region,       setRegion]       = useState({
    latitude: initLat, longitude: initLng,
    latitudeDelta: 0.02, longitudeDelta: 0.02,
  })
  const [address,       setAddress]       = useState('')
  const [loadingAddr,   setLoadingAddr]   = useState(false)
  const [locationNote,  setLocationNote]  = useState(route.params?.initialLocationNote || '')

  // Reverse geocode when pin moves
  useEffect(() => {
    if (!pinLocation) { setAddress(''); return }
    setLoadingAddr(true)
    const t = setTimeout(async () => {
      const addr = await reverseGeocode(pinLocation.latitude, pinLocation.longitude)
      setAddress(addr)
      setLoadingAddr(false)
    }, 600)
    return () => clearTimeout(t)
  }, [pinLocation?.latitude, pinLocation?.longitude])

  function updatePin(coord) {
    setPinLocation({ latitude: coord.latitude, longitude: coord.longitude })
  }

  async function handleCurrentLocation() {
    const coords = await getCurrentLocation()
    if (!coords) {
      Alert.alert('Location unavailable', 'Please enable location permissions in Settings.')
      return
    }
    const newPin = { latitude: coords.latitude, longitude: coords.longitude }
    setPinLocation(newPin)
    const r = { ...newPin, latitudeDelta: 0.005, longitudeDelta: 0.005 }
    setRegion(r)
    mapRef.current?.animateToRegion(r, 500)
  }

  function zoomIn() {
    const r = {
      ...region,
      latitudeDelta: Math.max(region.latitudeDelta / 2, 0.0002),
      longitudeDelta: Math.max(region.longitudeDelta / 2, 0.0002),
    }
    setRegion(r)
    mapRef.current?.animateToRegion(r, 200)
  }

  function zoomOut() {
    const r = {
      ...region,
      latitudeDelta: Math.min(region.latitudeDelta * 2, 50),
      longitudeDelta: Math.min(region.longitudeDelta * 2, 50),
    }
    setRegion(r)
    mapRef.current?.animateToRegion(r, 200)
  }

  function handleConfirm() {
    if (!pinLocation) return
    navigation.navigate({
      name: route.params?.returnTo || 'PostJob',
      params: {
        ...(route.params?.returnParams || {}),
        locationResult: {
          latitude:     pinLocation.latitude,
          longitude:    pinLocation.longitude,
          locationNote: locationNote.trim(),
          address,
        },
      },
      merge: true,
    })
  }

  const MAP_TYPES = [
    { id: 'standard',  label: 'Map' },
    { id: 'satellite', label: 'Satellite' },
    { id: 'hybrid',    label: 'Hybrid' },
  ]

  return (
    <View style={styles.screen}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{route.params?.title || 'Pin the job location'}</Text>
        <Text style={styles.subtitle}>{route.params?.subtitle || 'Tap the map or drag the pin to the exact spot'}</Text>
      </View>

      {/* Map */}
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          mapType={mapType}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={e => updatePin(e.nativeEvent.coordinate)}
          showsUserLocation
          showsMyLocationButton={false}>
          {pinLocation && (
            <Marker
              coordinate={pinLocation}
              draggable
              onDragEnd={e => updatePin(e.nativeEvent.coordinate)}
            />
          )}
        </MapView>

        {/* Map type toggle — top left */}
        <View style={styles.mapTypeBar}>
          {MAP_TYPES.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.mapTypeBtn, mapType === t.id && styles.mapTypeBtnActive]}
              onPress={() => setMapType(t.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: mapType === t.id }}>
              <Text style={[styles.mapTypeBtnText, mapType === t.id && styles.mapTypeBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Zoom + my location — top right */}
        <View style={styles.zoomBar}>
          <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn} accessibilityRole="button" accessibilityLabel="Zoom in">
            <Text style={styles.zoomBtnText}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut} accessibilityRole="button" accessibilityLabel="Zoom out">
            <Text style={styles.zoomBtnText}>－</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={handleCurrentLocation} accessibilityRole="button" accessibilityLabel="My location">
            <Text style={styles.zoomBtnText}>◎</Text>
          </TouchableOpacity>
        </View>

        {/* Use my current location pill — bottom of map */}
        <TouchableOpacity
          style={styles.myLocationPill}
          onPress={handleCurrentLocation}
          accessibilityRole="button"
          accessibilityLabel="Use my current location">
          <Text style={styles.myLocationPillText}>📍 Use my current location</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom info bar */}
      <View style={styles.infoBar}>
        <Text style={styles.infoLabel}>Pinned location</Text>
        {loadingAddr ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 4 }} />
        ) : (
          <Text style={styles.infoAddress} numberOfLines={2}>
            {address || (pinLocation ? 'Looking up address…' : 'Tap the map to set a pin')}
          </Text>
        )}
        {pinLocation && (
          <Text style={styles.infoCoords}>
            {pinLocation.latitude.toFixed(5)}, {pinLocation.longitude.toFixed(5)}
          </Text>
        )}
        <TextInput
          style={styles.noteInput}
          placeholder="Add a note for the provider (optional)"
          placeholderTextColor={colors.textMuted}
          value={locationNote}
          onChangeText={setLocationNote}
          returnKeyType="done"
          accessibilityLabel="Location note"
        />
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={() => { setPinLocation(null); setAddress('') }}
          accessibilityRole="button"
          accessibilityLabel="Clear pin">
          <Text style={styles.clearBtnText}>Clear pin</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, !pinLocation && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!pinLocation}
          accessibilityRole="button"
          accessibilityLabel="Confirm location">
          <Text style={styles.confirmBtnText}>Confirm location →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },

  // ─── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn:   { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 8 },
  backText:  { color: colors.primary, fontSize: 15, fontWeight: '600' },
  title:     { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle:  { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

  // ─── Map type toggle ────────────────────────────────────────────────────────
  mapTypeBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  mapTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    justifyContent: 'center',
  },
  mapTypeBtnActive:     { backgroundColor: colors.primary },
  mapTypeBtnText:       { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  mapTypeBtnTextActive: { color: colors.white },

  // ─── Zoom controls ──────────────────────────────────────────────────────────
  zoomBar: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 6,
  },
  zoomBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  zoomBtnText: { fontSize: 18, color: colors.textPrimary, fontWeight: '600', lineHeight: 22 },

  // ─── My location pill ───────────────────────────────────────────────────────
  myLocationPill: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    minHeight: 42,
    justifyContent: 'center',
  },
  myLocationPillText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  // ─── Bottom info bar ────────────────────────────────────────────────────────
  infoBar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  infoLabel:   { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  infoAddress: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, lineHeight: 20, marginBottom: 2 },
  infoCoords:  { fontSize: 11, color: colors.textMuted, marginBottom: 8 },
  noteInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 6,
    minHeight: 42,
  },

  // ─── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  clearBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  clearBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  confirmBtnDisabled: { backgroundColor: colors.primaryMuted },
  confirmBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
})
