import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, Image, Keyboard,
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import PostJobHeader from './PostJobHeader'
import JobLocationMap from '../../components/JobLocationMap'
import AddressAutocomplete from '../../components/AddressAutocomplete'
import { reverseGeocode } from '../../lib/location'
import { usePostJob } from '../../context/PostJobContext'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import Button from '../../components/Button'

const MAP_HEIGHT = 300

function getPhotoUri(photo) { return typeof photo === 'string' ? photo : photo?.uri }

function normalizeAsset(asset) {
  return {
    uri:      asset.uri,
    base64:   asset.base64 || null,
    mimeType: asset.mimeType || 'image/jpeg',
    fileName: asset.fileName || `job-photo-${Date.now()}.jpg`,
  }
}

function SummaryBar({ category, title }) {
  if (!category && !title) return null
  return (
    <View style={styles.summaryBar}>
      {!!category && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Category</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{category}</Text>
        </View>
      )}
      {!!title && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Title</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{title}</Text>
        </View>
      )}
    </View>
  )
}

export default function PostJobStep2Location({ navigation, route }) {
  const insets    = useSafeAreaInsets()
  const mapRef    = useRef(null)
  const scrollRef = useRef(null)
  const { jobData, updateJobData } = usePostJob()

  const isEditMode = route.params?.mode === 'edit'

  const [latitude,     setLatitude]     = useState(jobData.latitude)
  const [longitude,    setLongitude]    = useState(jobData.longitude)
  const [jobAddress,   setJobAddress]   = useState(jobData.jobAddress)
  const [locationNote, setLocationNote] = useState(jobData.locationNote)
  const [areaPolygon,  setAreaPolygon]  = useState(jobData.areaPolygon || [])
  const [areaHectares, setAreaHectares] = useState(jobData.areaHectares)
  const [mapType,      setMapType]      = useState('satellite')
  const [photos,       setPhotos]       = useState(jobData.photos || [])

  // GPS on mount for new jobs with no location yet
  useEffect(() => {
    if (isEditMode || jobData.latitude) {
      if (jobData.latitude) {
        setTimeout(() => {
          mapRef.current?.animateToRegion({
            latitude:       jobData.latitude,
            longitude:      jobData.longitude,
            latitudeDelta:  0.005,
            longitudeDelta: 0.005,
          }, 800)
        }, 300)
      }
      return
    }
    acquireGpsLocation()
  }, [])

  async function acquireGpsLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setLatitude(loc.coords.latitude)
      setLongitude(loc.coords.longitude)
      mapRef.current?.animateToRegion({
        latitude:       loc.coords.latitude,
        longitude:      loc.coords.longitude,
        latitudeDelta:  0.005,
        longitudeDelta: 0.005,
      }, 1000)
      const address = await reverseGeocode(loc.coords.latitude, loc.coords.longitude)
      setJobAddress(address)
    } catch {
      // location unavailable — user stays at NZ default
    }
  }

  // AreaTracer result
  useEffect(() => {
    if (!route.params?.areaResult) return
    const { polygonPoints, areaHectares: ha, centroid } = route.params.areaResult
    setAreaPolygon(polygonPoints || [])
    setAreaHectares(ha)
    if (centroid?.latitude) {
      setLatitude(centroid.latitude)
      setLongitude(centroid.longitude)
      setTimeout(() => {
        mapRef.current?.animateToRegion({
          latitude:       centroid.latitude,
          longitude:      centroid.longitude,
          latitudeDelta:  0.005,
          longitudeDelta: 0.005,
        }, 800)
      }, 100)
    }
    navigation.setParams({ areaResult: undefined })
  }, [route.params?.areaResult])

  // Keep context in sync
  useEffect(() => {
    updateJobData({ latitude, longitude, jobAddress, locationNote, areaPolygon, areaHectares, photos })
  }, [latitude, longitude, jobAddress, locationNote, areaPolygon, areaHectares, photos])

  const handleLocationSelect = useCallback(async ({ latitude: lat, longitude: lng }) => {
    setLatitude(lat)
    setLongitude(lng)
    setAreaPolygon([])
    setAreaHectares(null)
    const address = await reverseGeocode(lat, lng)
    setJobAddress(address)
  }, [])

  const handleAddressSelect = useCallback(({ address, latitude: lat, longitude: lng }) => {
    if (!lat || !lng) return
    setLatitude(lat)
    setLongitude(lng)
    setJobAddress(address)
    setAreaPolygon([])
    setAreaHectares(null)
    setTimeout(() => {
      mapRef.current?.animateToRegion({
        latitude:       lat,
        longitude:      lng,
        latitudeDelta:  0.003,
        longitudeDelta: 0.003,
      }, 800)
    }, 100)
  }, [])

  const handleCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location unavailable', 'Please enable location permissions in Settings.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const lat = loc.coords.latitude
      const lng = loc.coords.longitude
      setLatitude(lat)
      setLongitude(lng)
      setAreaPolygon([])
      setAreaHectares(null)
      mapRef.current?.animateToRegion({
        latitude:       lat,
        longitude:      lng,
        latitudeDelta:  0.005,
        longitudeDelta: 0.005,
      }, 1000)
      const address = await reverseGeocode(lat, lng)
      setJobAddress(address)
    } catch {
      Alert.alert('Location unavailable', 'Please enable location permissions in Settings.')
    }
  }, [])

  function handleTraceArea() {
    navigation.navigate('AreaTracer', {
      initialPoints: areaPolygon.length > 0 ? areaPolygon : [],
      returnTo:      route.name,
    })
  }

  async function handleAddPhoto() {
    if (photos.length >= 6) return
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
      if (!result.canceled) setPhotos(prev => [...prev, normalizeAsset(result.assets[0])])
    } catch { Alert.alert('Photo library unavailable', 'Could not open photos.') }
  }

  function handleBack() {
    navigation.goBack()
  }

  function handleSkip() {
    navigation.navigate('PostJobStep3Details', { ...route.params })
  }

  function handleNext() {
    Keyboard.dismiss()
    if (!latitude && areaPolygon.length === 0) {
      Alert.alert(
        'No location set',
        'Please pin a location on the map, or tap Skip to continue without one.',
        [
          { text: 'Set location', style: 'cancel' },
          { text: 'Skip', onPress: () => navigation.navigate('PostJobStep3Details', { ...route.params }) },
        ]
      )
      return
    }
    navigation.navigate('PostJobStep3Details', { ...route.params })
  }

  const hasArea = areaPolygon.length > 0

  return (
    <View style={styles.screen}>
      <PostJobHeader currentStep={2} onBack={handleBack} />

      <View style={styles.searchBarWrap}>
        <AddressAutocomplete
          placeholder="Search for job location..."
          value={jobAddress}
          onSelect={handleAddressSelect}
        />
      </View>

      <View style={styles.mapHint}>
        <Icon name="location-outline" size={14} color={colors.primary} />
        <Text style={styles.mapHintText}>
          Zoom and tap the map to drop a pin on the exact location, if required.
        </Text>
      </View>

      <View style={styles.mapContainer}>
        <JobLocationMap
          ref={mapRef}
          latitude={latitude}
          longitude={longitude}
          mapType={mapType}
          onLocationSelect={handleLocationSelect}
        />

        <View style={styles.mapTypeBar}>
          {[['standard','Map'],['satellite','Sat'],['hybrid','Hybrid']].map(([t, label]) => (
            <TouchableOpacity
              key={t}
              style={[styles.mapTypeBtn, mapType === t && styles.mapTypeBtnActive]}
              onPress={() => setMapType(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: mapType === t }}>
              <Text style={[styles.mapTypeBtnText, mapType === t && styles.mapTypeBtnTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.mapControls}>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => mapRef.current?.zoomIn()}
            accessibilityRole="button"
            accessibilityLabel="Zoom in">
            <Icon name="add" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => mapRef.current?.zoomOut()}
            accessibilityRole="button"
            accessibilityLabel="Zoom out">
            <Icon name="remove" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={handleCurrentLocation}
            accessibilityRole="button"
            accessibilityLabel="Use my location">
            <Icon name="locate" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        enabled={Platform.OS === 'android'}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}>

          <SummaryBar category={jobData.category} title={jobData.title} />

          <View style={styles.pillsRow}>
            <TouchableOpacity
              style={styles.pill}
              onPress={handleTraceArea}
              accessibilityRole="button"
              accessibilityLabel="Trace work area">
              <Icon name="map-outline" size={16} color={colors.primary} />
              <Text style={styles.pillText}>Trace area</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pill}
              onPress={handleAddPhoto}
              accessibilityRole="button"
              accessibilityLabel="Add a photo">
              <Icon name="camera-outline" size={16} color={colors.primary} />
              <Text style={styles.pillText}>Add photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pillSkip}
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip location">
              <Text style={styles.pillSkipText}>Skip location</Text>
            </TouchableOpacity>
          </View>

          {hasArea && (
            <View style={styles.areaChip}>
              <Text style={styles.areaChipText}><Icon name="checkmark" size={12} color={colors.primary} /> {areaHectares} ha traced</Text>
              <TouchableOpacity
                onPress={() => { setAreaPolygon([]); setAreaHectares(null) }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {photos.length > 0 && (
            <View style={styles.photoRow}>
              {photos.map((p, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri: getPhotoUri(p) }} style={styles.photoImg} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.footerBtns}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Go back">
              <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
            </TouchableOpacity>
            <Button
              title="Next — Details"
              icon="arrow-forward"
              onPress={handleNext}
              style={{ flex: 1 }}
              accessibilityLabel="Next step"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#f5f5f5' },
  flex1:   { flex: 1 },

  summaryBar: {
    backgroundColor: '#f0faf5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c3e6d4',
    padding: 10,
    marginBottom: 10,
    gap: 4,
  },
  summaryRow:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  summaryLabel: { fontSize: 9, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8, minWidth: 52 },
  summaryValue: { flex: 1, fontSize: 13, fontWeight: '600', color: '#333' },

  searchBarWrap: {
    zIndex: 999,
    elevation: 999,
    padding: 10,
    backgroundColor: colors.primary,
  },

  mapContainer: { height: MAP_HEIGHT, position: 'relative' },
  mapTypeBar: {
    position: 'absolute', bottom: 10, left: 8,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3,
    elevation: 3, zIndex: 10,
  },
  mapTypeBtn:           { paddingHorizontal: 10, paddingVertical: 6, minHeight: 30, justifyContent: 'center' },
  mapTypeBtnActive:     { backgroundColor: colors.primary },
  mapTypeBtnText:       { fontSize: 11, fontWeight: '600', color: '#333' },
  mapTypeBtnTextActive: { color: '#fff' },
  mapControls:   { position: 'absolute', top: 10, right: 8, gap: 6, zIndex: 10 },
  mapControlBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, elevation: 3,
  },
  mapControlText: { fontSize: 16, fontWeight: '700', color: '#333', lineHeight: 20 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 24 },

  mapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0faf5',
    borderBottomWidth: 0.5,
    borderBottomColor: '#c3e6d4',
  },
  mapHintText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 16 },

  pillsRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillIcon:     { fontSize: 13 },
  pillText:     { fontSize: 12, fontWeight: '500', color: '#333' },
  pillSkip:     { marginLeft: 'auto' },
  pillSkipText: { fontSize: 12, color: '#999', textDecorationLine: 'underline' },

  areaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    marginBottom: 10,
    gap: 6,
  },
  areaChipText:   { fontSize: 13, fontWeight: '700', color: '#2d6a4f' },
  areaChipRemove: { fontSize: 12, color: '#2d6a4f', fontWeight: '700' },

  photoRow:        { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  photoThumb:      { width: 70, height: 70, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photoImg:        { width: 70, height: 70 },
  photoRemove:     { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  footerBtns:  { flexDirection: 'row', gap: 10 },
  backBtn:     { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  backBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
})
