import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from './Icon'
import { reverseGeocode, getCurrentLocation, haversineDistance } from '../lib/location'

export default function JobMapScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const mapRef = useRef(null)
  const { job, requesterName, viewOnly } = route.params

  const jobLat = parseFloat(job.latitude)
  const jobLng = parseFloat(job.longitude)

  const [mapType,          setMapType]          = useState('hybrid')
  const [providerLocation, setProviderLocation] = useState(null)
  const [address,          setAddress]          = useState('')
  const [checkedIn,        setCheckedIn]        = useState(false)

  useEffect(() => {
    // Get provider's current location
    getCurrentLocation().then(coords => {
      if (coords) setProviderLocation(coords)
    })
    // Reverse geocode job location
    if (job.latitude && job.longitude) {
      reverseGeocode(jobLat, jobLng).then(setAddress)
    }
  }, [])

  // Fit map to both points once provider location is known
  useEffect(() => {
    if (!providerLocation || !job.latitude) return
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        [
          { latitude: providerLocation.latitude, longitude: providerLocation.longitude },
          { latitude: jobLat, longitude: jobLng },
        ],
        { edgePadding: { top: 120, right: 60, bottom: 260, left: 60 }, animated: true }
      )
    }, 600)
    return () => clearTimeout(timer)
  }, [providerLocation])

  const distanceKm = providerLocation
    ? haversineDistance(providerLocation.latitude, providerLocation.longitude, jobLat, jobLng).toFixed(1)
    : null

  const driveMinutes = distanceKm
    ? Math.round(parseFloat(distanceKm) / 60 * 60)
    : null

  async function handleCheckIn() {
    if (!providerLocation) {
      Alert.alert('Location unavailable', 'Could not get your current location.')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('job_checkins').insert({
      job_id:       job.id,
      user_id:      user.id,
      latitude:     providerLocation.latitude,
      longitude:    providerLocation.longitude,
      checkin_type: 'arrived',
    })
    if (error) {
      Alert.alert('Check-in failed', error.message)
    } else {
      setCheckedIn(true)
      Alert.alert('Check-in recorded!', 'Your arrival has been logged.')
    }
  }

  function handleDirections() {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${jobLat},${jobLng}`
    Linking.openURL(url)
  }

  const MAP_TYPES = [
    { id: 'standard',  label: 'Map' },
    { id: 'satellite', label: 'Satellite' },
    { id: 'hybrid',    label: 'Hybrid' },
  ]

  const hasPolygon = Array.isArray(job.area_polygon) && job.area_polygon.length >= 3

  return (
    <View style={styles.screen}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backText}><Icon name="chevron-back" size={16} color={colors.primary} /> Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title} numberOfLines={1}>{job.title || 'Job location'}</Text>
        {requesterName ? <Text style={styles.subtitle}>{requesterName}</Text> : null}
      </View>

      {/* Map */}
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          mapType={mapType}
          showsUserLocation
          showsMyLocationButton={false}
          initialRegion={{
            latitude: jobLat,
            longitude: jobLng,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}>

          {/* Job pin */}
          {job.latitude && (
            <Marker
              coordinate={{ latitude: jobLat, longitude: jobLng }}
              pinColor="red"
            />
          )}

          {/* Area polygon */}
          {hasPolygon && (
            <Polygon
              coordinates={job.area_polygon}
              fillColor="rgba(45,106,79,0.3)"
              strokeColor="#2d6a4f"
              strokeWidth={2}
            />
          )}

          {/* Dashed route line */}
          {providerLocation && job.latitude && (
            <Polyline
              coordinates={[
                { latitude: providerLocation.latitude, longitude: providerLocation.longitude },
                { latitude: jobLat, longitude: jobLng },
              ]}
              strokeColor={colors.primary}
              strokeWidth={2}
              lineDashPattern={[10, 5]}
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

        {/* Distance card — top right */}
        {distanceKm != null && (
          <View style={styles.distanceCard}>
            <Text style={styles.distanceLabel}>DISTANCE TO JOB</Text>
            <Text style={styles.distanceValue}>{distanceKm} km</Text>
            {driveMinutes != null && (
              <Text style={styles.driveTime}>~{driveMinutes} min drive</Text>
            )}
          </View>
        )}
      </View>

      {/* Bottom info + actions */}
      <View style={[styles.infoBar, { paddingBottom: insets.bottom + 12 }]}>

        {/* Location info */}
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Job location</Text>
          {address ? (
            <Text style={styles.infoAddress} numberOfLines={2}>{address}</Text>
          ) : null}
          {job.location_note ? (
            <Text style={styles.infoNote}><Icon name="document-text-outline" size={12} color={colors.textSecondary} /> {job.location_note}</Text>
          ) : null}
          {job.location_name && !address ? (
            <Text style={styles.infoAddress}>{job.location_name}</Text>
          ) : null}
          {hasPolygon && job.area_hectares ? (
            <Text style={styles.infoArea}><Icon name="shapes-outline" size={12} color={colors.primary} /> {job.area_hectares} ha work area</Text>
          ) : null}
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {!viewOnly && job.id && (
            <TouchableOpacity
              style={[styles.checkInBtn, checkedIn && styles.checkInBtnDone]}
              onPress={handleCheckIn}
              disabled={checkedIn}
              accessibilityRole="button"
              accessibilityLabel="Check in">
              <Text style={[styles.checkInBtnText, checkedIn && styles.checkInBtnTextDone]}>
                {checkedIn ? <><Icon name="checkmark" size={14} color={colors.primary} /> Checked in</> : 'Check in'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.directionsBtn}
            onPress={handleDirections}
            accessibilityRole="button"
            accessibilityLabel="Get directions">
            <Text style={styles.directionsBtnText}>Get directions <Icon name="arrow-forward" size={15} color="#fff" /></Text>
          </TouchableOpacity>
        </View>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { marginBottom: 8 },
  backBtn:   { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backText:  { color: colors.primary, fontSize: 15, fontWeight: '600' },
  title:     { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  subtitle:  { fontSize: 13, color: colors.textSecondary },

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
  mapTypeBtn:           { paddingHorizontal: 12, paddingVertical: 7, minHeight: 34, justifyContent: 'center' },
  mapTypeBtnActive:     { backgroundColor: colors.primary },
  mapTypeBtnText:       { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  mapTypeBtnTextActive: { color: colors.white },

  // ─── Distance card ──────────────────────────────────────────────────────────
  distanceCard: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    alignItems: 'flex-end',
  },
  distanceLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  distanceValue: { fontSize: 22, fontWeight: '700', color: colors.primary, lineHeight: 26 },
  driveTime:     { fontSize: 11, color: colors.textSecondary },

  // ─── Bottom info bar ────────────────────────────────────────────────────────
  infoBar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  infoSection:  { marginBottom: 12 },
  infoLabel:    { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  infoAddress:  { fontSize: 14, fontWeight: '600', color: colors.textPrimary, lineHeight: 20, marginBottom: 2 },
  infoNote:     { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  infoArea:     { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 4 },

  // ─── Action buttons ─────────────────────────────────────────────────────────
  actionRow:       { flexDirection: 'row', gap: 10 },
  checkInBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  checkInBtnDone:     { borderColor: colors.primaryMuted, backgroundColor: colors.primaryLight },
  checkInBtnText:     { color: colors.primary, fontSize: 14, fontWeight: '700' },
  checkInBtnTextDone: { color: colors.primary, opacity: 0.7 },
  directionsBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  directionsBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
})
