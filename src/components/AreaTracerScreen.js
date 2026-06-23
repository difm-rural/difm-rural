import React, { useState } from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Marker, Polygon } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/tokens'
import Icon from './Icon'
import { haversineDistance } from '../lib/location'

const NZ_CENTER = { latitude: -41.2865, longitude: 174.7762 }

function calculateArea(coordinates) {
  if (coordinates.length < 3) return 0
  const R = 6371000
  let area = 0
  const n = coordinates.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const xi = coordinates[i].longitude * Math.PI / 180
    const yi = coordinates[i].latitude  * Math.PI / 180
    const xj = coordinates[j].longitude * Math.PI / 180
    const yj = coordinates[j].latitude  * Math.PI / 180
    area += xi * yj
    area -= xj * yi
  }
  area = Math.abs(area) / 2
  const areaM2 = area * R * R * Math.cos(coordinates[0].latitude * Math.PI / 180)
  return (areaM2 / 10000).toFixed(2)
}

function calculatePerimeter(coords) {
  if (coords.length < 2) return '0'
  let perim = 0
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length
    perim += haversineDistance(
      coords[i].latitude, coords[i].longitude,
      coords[j].latitude, coords[j].longitude,
    )
  }
  return (perim * 1000).toFixed(0)
}

export default function AreaTracerScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()

  const initPoints = route.params?.initialPoints || []
  const initLat    = initPoints[0]?.latitude  || NZ_CENTER.latitude
  const initLng    = initPoints[0]?.longitude || NZ_CENTER.longitude

  const [polygonPoints, setPolygonPoints] = useState(initPoints)
  const [mapType,       setMapType]       = useState('hybrid')
  const [region,        setRegion]        = useState({
    latitude: initLat, longitude: initLng,
    latitudeDelta: 0.02, longitudeDelta: 0.02,
  })

  function addPoint(coord) {
    setPolygonPoints(prev => [...prev, { latitude: coord.latitude, longitude: coord.longitude }])
  }

  function undoLastPoint() {
    setPolygonPoints(prev => prev.slice(0, -1))
  }

  function clearAll() {
    setPolygonPoints([])
  }

  function handleConfirm() {
    if (polygonPoints.length < 3) return
    const areaHectares = calculateArea(polygonPoints)
    const centroid = polygonPoints.reduce(
      (acc, p) => ({ latitude: acc.latitude + p.latitude / polygonPoints.length, longitude: acc.longitude + p.longitude / polygonPoints.length }),
      { latitude: 0, longitude: 0 }
    )
    navigation.navigate(route.params?.returnTo || 'PostJob', {
      areaResult: { polygonPoints, areaHectares, centroid },
    })
  }

  const areaHa  = polygonPoints.length >= 3 ? calculateArea(polygonPoints) : null
  const perimM  = polygonPoints.length >= 3 ? calculatePerimeter(polygonPoints) : null

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
          <Text style={styles.backText}><Icon name="chevron-back" size={16} color={colors.primary} /> Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trace the work area</Text>
        <Text style={styles.subtitle}>Tap around the paddock boundary</Text>
      </View>

      {/* Map */}
      <View style={{ flex: 1 }}>
        <MapView
          style={StyleSheet.absoluteFill}
          mapType={mapType}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={e => addPoint(e.nativeEvent.coordinate)}>

          {/* Polygon fill when 3+ points */}
          {polygonPoints.length >= 3 && (
            <Polygon
              coordinates={polygonPoints}
              fillColor="rgba(45,106,79,0.3)"
              strokeColor="#2d6a4f"
              strokeWidth={2}
            />
          )}

          {/* Point markers */}
          {polygonPoints.map((pt, i) => (
            <Marker
              key={i}
              coordinate={pt}
              anchor={{ x: 0.5, y: 0.5 }}
              flat>
              <View style={styles.pointDot} />
            </Marker>
          ))}
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

        {/* Controls — top right */}
        <View style={styles.controlsBar}>
          <TouchableOpacity
            style={[styles.controlBtn, polygonPoints.length === 0 && styles.controlBtnDisabled]}
            onPress={undoLastPoint}
            disabled={polygonPoints.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Undo last point">
            <Text style={styles.controlBtnText}>Undo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, polygonPoints.length === 0 && styles.controlBtnDisabled]}
            onPress={clearAll}
            disabled={polygonPoints.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Clear all points">
            <Text style={styles.controlBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom info bar */}
      <View style={styles.infoBar}>
        {areaHa != null ? (
          <>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>Area selected</Text>
                <Text style={styles.infoItemValueBig}>{areaHa} ha</Text>
              </View>
              <View style={[styles.infoItem, { alignItems: 'flex-end' }]}>
                <Text style={styles.infoItemLabel}>Perimeter</Text>
                <Text style={styles.infoItemValue}>{perimM} m</Text>
              </View>
            </View>
            <Text style={styles.infoPointCount}>{polygonPoints.length} points placed</Text>
          </>
        ) : (
          <Text style={styles.infoHint}>
            {polygonPoints.length === 0
              ? 'Tap the map to start tracing'
              : `${polygonPoints.length} point${polygonPoints.length > 1 ? 's' : ''} placed — add at least 3 to calculate area`}
          </Text>
        )}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.undoBtn, polygonPoints.length === 0 && styles.undoBtnDisabled]}
          onPress={undoLastPoint}
          disabled={polygonPoints.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Undo last point">
          <Text style={[styles.undoBtnText, polygonPoints.length === 0 && styles.undoBtnTextDisabled]}>
            Undo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, polygonPoints.length < 3 && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={polygonPoints.length < 3}
          accessibilityRole="button"
          accessibilityLabel="Confirm area">
          <Text style={styles.confirmBtnText}>Confirm area <Icon name="arrow-forward" size={15} color="#fff" /></Text>
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
  backBtn:  { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 8 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  title:    { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

  // ─── Point dot markers ──────────────────────────────────────────────────────
  pointDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.white,
    borderWidth: 2.5,
    borderColor: colors.primary,
  },

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

  // ─── Controls bar ───────────────────────────────────────────────────────────
  controlsBar: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 6,
  },
  controlBtn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
    minHeight: 34,
    justifyContent: 'center',
  },
  controlBtnDisabled: { opacity: 0.4 },
  controlBtnText:     { fontSize: 12, fontWeight: '700', color: colors.textPrimary },

  // ─── Bottom info bar ────────────────────────────────────────────────────────
  infoBar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
    justifyContent: 'center',
  },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  infoItem:         { flex: 1 },
  infoItemLabel:    { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  infoItemValueBig: { fontSize: 22, fontWeight: '700', color: colors.primary },
  infoItemValue:    { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  infoPointCount:   { fontSize: 12, color: colors.textMuted },
  infoHint:         { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },

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
  undoBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  undoBtnDisabled:  { borderColor: colors.border },
  undoBtnText:      { color: colors.primary, fontSize: 14, fontWeight: '600' },
  undoBtnTextDisabled: { color: colors.textMuted },
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
  confirmBtnText:     { color: colors.white, fontSize: 15, fontWeight: '700' },
})
