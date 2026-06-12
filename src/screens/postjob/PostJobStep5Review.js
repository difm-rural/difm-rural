import React, { useRef, useState, useEffect } from 'react'
import {
  Alert, Animated, Dimensions, Image, Modal,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import PostJobHeader from './PostJobHeader'
import { usePostJob } from '../../context/PostJobContext'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'
import { trackCategoryInterest } from '../../lib/preferences'
import { staticMapUrl, staticMapPolygonUrl } from '../../lib/maps'
import { colors } from '../../theme/tokens'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const SCHEDULE_LABELS = {
  asap:     'As soon as possible',
  specific: 'On a specific date',
  flexible: "I'm flexible",
}

const MATERIALS_LABELS = {
  none:      'No materials needed',
  requester: 'I supply materials',
  provider:  'Provider to supply',
}
const ACCESS_LABELS = {
  park_and_walk: 'Park and walk in',
  '4wd_required': '4WD required',
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function getPhotoUri(photo) { return typeof photo === 'string' ? photo : photo?.uri }
function isRemotePhoto(photo) { return typeof photo === 'string' && photo.startsWith('http') }

function base64ToArrayBuffer(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/=+$/, '')
  const bytes = []; let buffer = 0; let bits = 0
  for (let i = 0; i < clean.length; i++) {
    const value = chars.indexOf(clean[i])
    if (value < 0) continue
    buffer = (buffer << 6) | value; bits += 6
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff) }
  }
  return new Uint8Array(bytes).buffer
}

function AuthSheet({ onDismiss, onLogin }) {
  const translateY      = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0.5, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [])

  function dismiss() {
    Animated.parallel([
      Animated.timing(translateY,      { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0,             duration: 250, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDismiss() })
  }

  return (
    <View style={styles.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <TouchableOpacity
        style={styles.absoluteFill}
        activeOpacity={1}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss" />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <Text style={styles.sheetTitle}>Almost there!</Text>
        <Text style={styles.sheetMessage}>
          Sign in to post your job. Your details have been saved.{'\n'}
          New? Just enter your email — we'll create your account automatically.
        </Text>
        <TouchableOpacity
          style={styles.sheetPrimary}
          onPress={() => { dismiss(); setTimeout(onLogin, 280) }}
          accessibilityRole="button">
          <Text style={styles.sheetPrimaryText}>Sign in / Create account</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

export default function PostJobStep5Review({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { jobData, resetJobData } = usePostJob()

  const isEditMode   = route.params?.mode === 'edit'
  const editJob      = route.params?.job || null
  const editBidCount = route.params?.bidCount || 0

  const {
    latitude, longitude, jobAddress, locationNote,
    areaPolygon = [], areaHectares,
    category, title,
    scheduleType, scheduledDate,
    priceType, price,
    photos = [],
    description,
    materialsType,
    accessConditions = [],
  } = jobData

  const [uploadStatus,  setUploadStatus]  = useState('')
  const [showAuthSheet, setShowAuthSheet] = useState(false)

  const locationSummary = jobAddress
    || (latitude ? `${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}` : 'No location set')

  const scheduleLabel   = SCHEDULE_LABELS[scheduleType] || scheduleType
  const scheduleDisplay = scheduleType === 'specific' && scheduledDate
    ? `${scheduleLabel} — ${formatDate(scheduledDate)}`
    : scheduleLabel
  const budgetDisplay   = priceType === 'fixed' ? `$${price} NZD (fixed price)` : 'Open to bids'

  const mapImgUri = areaPolygon.length > 0
    ? staticMapPolygonUrl(areaPolygon)
    : (latitude ? staticMapUrl(latitude, longitude) : null)

  // Step order: 1=JobType, 2=Location, 3=Details, 4=Budget, 5=Review
  // popCount = screens to pop from Step5 to reach that step
  const rows = [
    { label: 'Location',    value: locationSummary, popCount: 3 },
    { label: 'Category',    value: category,        popCount: 4 },
    { label: 'Title',       value: title,           popCount: 4 },
    { label: 'When',        value: scheduleDisplay, popCount: 4 },
    { label: 'Budget',      value: budgetDisplay,   popCount: 1 },
    photos.length > 0
      ? { label: 'Photos', value: `${photos.length} photo${photos.length !== 1 ? 's' : ''} attached`, popCount: 2 }
      : null,
    locationNote ? { label: 'Location note', value: locationNote, popCount: 3 } : null,
    { label: 'Description', value: description,     popCount: 2 },
    materialsType ? { label: 'Materials', value: MATERIALS_LABELS[materialsType] || materialsType, popCount: 2 } : null,
    accessConditions.length > 0
      ? { label: 'Site access', value: accessConditions.map(c => ACCESS_LABELS[c] || c).join(', '), popCount: 2 }
      : null,
  ].filter(Boolean)

  function handleBack() {
    navigation.goBack()
  }

  function handleEditRow(popCount) {
    navigation.pop(popCount)
  }

  async function uploadPhotos(jobId) {
    const localPhotos = photos.filter(p => !isRemotePhoto(p))
    if (!localPhotos.length) return photos.filter(isRemotePhoto)
    const urls = photos.filter(isRemotePhoto)
    for (let i = 0; i < localPhotos.length; i++) {
      try {
        const photo    = localPhotos[i]
        const uri      = getPhotoUri(photo)
        const mimeType = typeof photo === 'string' ? 'image/jpeg' : (photo.mimeType || 'image/jpeg')
        const ext      = (photo.fileName || uri)?.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
        const path     = `${jobId}/${Date.now()}_${i}.${ext}`
        const fileData = photo.base64
          ? base64ToArrayBuffer(photo.base64)
          : await (await fetch(uri)).arrayBuffer()
        const { error } = await supabase.storage.from('job-photos').upload(path, fileData, { contentType: mimeType, upsert: false })
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from('job-photos').getPublicUrl(path)
          urls.push(publicUrl)
        }
      } catch { /* skip failed photo */ }
    }
    return urls
  }

  async function handleSubmit() {
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      title,
      description,
      category,
      price_type:        priceType,
      price:             priceType === 'fixed' ? parseFloat(price) : null,
      location_name:     jobAddress || null,
      location_note:     locationNote || null,
      latitude:          latitude  || null,
      longitude:         longitude || null,
      area_polygon:      areaPolygon.length > 0 ? areaPolygon : null,
      area_hectares:     areaHectares || null,
      schedule_type:     scheduleType,
      scheduled_date:    scheduleType === 'specific' && scheduledDate
        ? (typeof scheduledDate === 'string' ? scheduledDate.split('T')[0] : new Date(scheduledDate).toISOString().split('T')[0])
        : null,
      materials_type:    materialsType || null,
      access_conditions: accessConditions.length > 0 ? accessConditions : null,
    }

    if (!user) {
      await AsyncStorage.setItem('pendingJob', JSON.stringify(payload))
      setShowAuthSheet(true)
      return
    }

    setUploadStatus(isEditMode ? 'Saving...' : 'Posting...')

    if (isEditMode && editJob) {
      const { error } = await supabase
        .from('jobs').update(payload).eq('id', editJob.id).eq('requester_id', user.id)
      if (error) { setUploadStatus(''); Alert.alert('Error', error.message); return }

      setUploadStatus('Uploading photos...')
      const finalUrls = await uploadPhotos(editJob.id)
      await supabase.from('jobs').update({ photos: finalUrls }).eq('id', editJob.id)

      setUploadStatus('')
      resetJobData()
      Alert.alert('Job updated', 'Your job has been updated.', [
        { text: 'OK', onPress: () => navigation.popToTop() },
      ])
      return
    }

    const { data: newJob, error: insertError } = await supabase
      .from('jobs')
      .insert({ ...payload, requester_id: user.id, status: 'open' })
      .select('id')
      .single()
    if (insertError) { setUploadStatus(''); Alert.alert('Error', insertError.message); return }

    if (photos.length > 0) {
      setUploadStatus('Uploading photos...')
      const finalUrls = await uploadPhotos(newJob.id)
      if (finalUrls.length > 0) {
        await supabase.from('jobs').update({ photos: finalUrls }).eq('id', newJob.id)
      }
    }

    trackEvent('job_posted', { category, price_type: priceType, location: jobAddress })
    trackCategoryInterest(category)
    setUploadStatus('')
    resetJobData()
    Alert.alert('Job posted!', 'Providers near you will be notified.', [
      { text: 'OK', onPress: () => navigation.popToTop() },
    ])
  }

  const submitLabel = uploadStatus || (isEditMode ? 'Save changes' : 'Post job →')

  return (
    <View style={styles.screen}>
      <PostJobHeader
        currentStep={5}
        title={isEditMode ? 'Edit job' : 'Post a job'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>

        {mapImgUri ? (
          <Image source={{ uri: mapImgUri }} style={styles.mapThumb} resizeMode="cover" />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>📍 No location set</Text>
          </View>
        )}

        <View style={styles.reviewCard}>
          {rows.map((row, i) => (
            <View key={row.label} style={[styles.reviewRow, i < rows.length - 1 && styles.reviewRowBorder]}>
              <View style={styles.reviewFlex}>
                <Text style={styles.reviewLabel}>{row.label}</Text>
                <Text
                  style={styles.reviewValue}
                  numberOfLines={row.label === 'Description' ? 4 : 2}>
                  {row.value}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleEditRow(row.popCount)}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 4 }}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>⚡</Text>
          <Text style={styles.infoText}>
            Your job will be visible to providers{' '}
            {latitude || areaPolygon.length > 0
              ? `near ${jobAddress || 'your location'}`
              : 'across the platform'}{' '}
            immediately.
          </Text>
        </View>

        {isEditMode && editBidCount > 0 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠️ This job has {editBidCount} bid{editBidCount > 1 ? 's' : ''}. Editing may affect existing bids.
            </Text>
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
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, !!uploadStatus && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!!uploadStatus}
            accessibilityRole="button"
            accessibilityLabel={submitLabel}>
            <Text style={styles.submitBtnText}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showAuthSheet}
        transparent
        animationType="none"
        onRequestClose={() => setShowAuthSheet(false)}>
        <AuthSheet
          onDismiss={() => setShowAuthSheet(false)}
          onLogin={() => navigation.navigate('Login')}
        />
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#f5f5f5' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16 },

  mapThumb: {
    width: '100%',
    height: 130,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#ddd',
  },
  mapPlaceholder: {
    width: '100%',
    height: 72,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#f0faf5',
    borderWidth: 1,
    borderColor: '#c3e6d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: { fontSize: 14, color: colors.textMuted },

  reviewCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  reviewRow:       { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  reviewRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  reviewFlex:      { flex: 1 },
  reviewLabel:     { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  reviewValue:     { fontSize: 14, color: '#222', lineHeight: 20 },
  editLink:        { fontSize: 13, color: colors.primary, textDecorationLine: 'underline', paddingTop: 2, marginLeft: 8, flexShrink: 0 },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fcd34d',
    gap: 10,
    marginBottom: 12,
  },
  infoIcon: { fontSize: 18 },
  infoText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 },

  warningBox: {
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffb74d',
    marginBottom: 12,
  },
  warningText: { fontSize: 13, color: '#e65100' },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  footerBtns:        { flexDirection: 'row', gap: 10 },
  backBtn:           { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  backBtnText:       { color: colors.primary, fontSize: 14, fontWeight: '600' },
  submitBtn:         { flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  submitBtnDisabled: { backgroundColor: colors.primaryMuted },
  submitBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },

  absoluteFill: { ...StyleSheet.absoluteFillObject },
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, paddingBottom: 48,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, elevation: 20,
  },
  sheetTitle:         { fontSize: 22, fontWeight: '700', color: '#222', marginBottom: 8 },
  sheetMessage:       { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 24 },
  sheetPrimary:       { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  sheetPrimaryText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  sheetSecondary:     { padding: 14, alignItems: 'center' },
  sheetSecondaryText: { color: colors.primary, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
})
