import React, { useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const CATEGORIES = ['Machinery', 'Labour', 'Water delivery', 'Animal care', 'Maintenance', 'Fencing', 'Other']
const PRICING_TYPES = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'per_unit', label: 'Per unit' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'day_rate', label: 'Day rate' },
]
const STEP_LABELS = ['Service', 'Details', 'Price', 'Location', 'Equipment', 'Review']

function getPhotoUri(photo) {
  return typeof photo === 'string' ? photo : photo?.uri
}

function normalizePickedAsset(asset) {
  return {
    uri: asset.uri,
    base64: asset.base64 || null,
    mimeType: asset.mimeType || 'image/jpeg',
    fileName: asset.fileName || `service-photo-${Date.now()}.jpg`,
  }
}

function formatDisplayDate(d) {
  return d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function base64ToArrayBuffer(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/=+$/, '')
  const bytes = []
  let buffer = 0
  let bits = 0

  for (let i = 0; i < clean.length; i++) {
    const value = chars.indexOf(clean[i])
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  return new Uint8Array(bytes).buffer
}

export default function CreateServiceScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const editingService = route?.params?.service || null
  const isEditing = !!editingService?.id
  const [step, setStep] = useState(1)

  const [title, setTitle] = useState(editingService?.title || '')
  const [category, setCategory] = useState(editingService?.category || '')
  const [description, setDescription] = useState(editingService?.description || '')
  const [photos, setPhotos] = useState(Array.isArray(editingService?.photos) ? editingService.photos : [])

  const [pricingType, setPricingType] = useState(editingService?.pricing_type || '')
  const [rate, setRate] = useState(editingService?.rate != null ? String(editingService.rate) : '')
  const [unitLabel, setUnitLabel] = useState(editingService?.unit_label || '')
  const [locationName, setLocationName] = useState(editingService?.location_name || '')
  const [travelRange, setTravelRange] = useState(editingService?.travel_range_km != null ? String(editingService.travel_range_km) : '')
  const [availableFrom,   setAvailableFrom]   = useState(editingService?.availability ? new Date(editingService.availability) : null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [includesEquipment, setIncludesEquipment] = useState(!!editingService?.includes_equipment)

  const [submitting, setSubmitting] = useState(false)
  const stepTranslateX = useRef(new Animated.Value(0)).current

  function animateStep(newStep, direction) {
    const outTo = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH
    const inFrom = direction === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH
    Animated.timing(stepTranslateX, { toValue: outTo, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return
      setStep(newStep)
      stepTranslateX.setValue(inFrom)
      Animated.timing(stepTranslateX, { toValue: 0, duration: 180, useNativeDriver: true }).start()
    })
  }

  function canProceed() {
    if (step === 1) return !!(title.trim() && category)
    if (step === 2) return true
    if (step === 3) return !!(pricingType && rate.trim())
    if (step === 4) return !!locationName.trim()
    if (step === 5) return true
    return true
  }

  function formatRate() {
    if (pricingType === 'hourly') return `$${rate}/hr`
    if (pricingType === 'day_rate') return `$${rate}/day`
    if (pricingType === 'per_unit') return `$${rate}/${unitLabel || 'unit'}`
    return `$${rate} fixed`
  }

  async function pickPhoto() {
    if (photos.length >= 4) return
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add service photos.')
      return
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
      if (!result.canceled) setPhotos(prev => [...prev, normalizePickedAsset(result.assets[0])])
    } catch (error) {
      Alert.alert('Photo library unavailable', error?.message || 'Could not open the photo library.')
    }
  }

  async function uploadPhotos(serviceId) {
    const urls = []
    let failed = 0
    let firstError = ''

    for (let i = 0; i < photos.length; i++) {
      try {
        const photo = photos[i]
        if (typeof photo === 'string') {
          urls.push(photo)
          continue
        }
        const ext = (photo.fileName || photo.uri || 'jpg').split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
        const path = `${serviceId}/${Date.now()}_${i}.${ext}`
        const fileData = photo.base64
          ? base64ToArrayBuffer(photo.base64)
          : await (await fetch(photo.uri)).arrayBuffer()
        const { error } = await supabase.storage
          .from('service-photos')
          .upload(path, fileData, { contentType: photo.mimeType || 'image/jpeg', upsert: false })
        if (error) {
          failed += 1
          if (!firstError) firstError = error.message || 'Storage upload failed.'
        } else {
          const { data: { publicUrl } } = supabase.storage.from('service-photos').getPublicUrl(path)
          urls.push(publicUrl)
        }
      } catch (error) {
        failed += 1
        if (!firstError) firstError = error?.message || 'Could not read the selected photo.'
      }
    }

    return { urls, failed, firstError }
  }

  async function handlePublish() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to list a service.')
      return
    }

    setSubmitting(true)
    const payload = {
      provider_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      category,
      location_name: locationName.trim(),
      travel_range_km: travelRange ? parseFloat(travelRange) : null,
      pricing_type: pricingType,
      rate: parseFloat(rate),
      unit_label: pricingType === 'per_unit' ? unitLabel.trim() || null : null,
      minimum_units: 1,
      includes_equipment: includesEquipment,
      payment_timing: 'on_completion',
      availability: availableFrom ? availableFrom.toISOString().split('T')[0] : null,
      is_active: true,
      ...(isEditing && photos.length === 0 ? { photos: [] } : {}),
    }

    const query = isEditing
      ? supabase
        .from('services')
        .update(payload)
        .eq('id', editingService.id)
        .eq('provider_id', user.id)
      : supabase.from('services').insert(payload)

    const { data: createdService, error } = await query.select().single()

    if (error) {
      setSubmitting(false)
      Alert.alert('Error', error.message)
      return
    }

    let serviceForRoute = createdService
    if (photos.length > 0) {
      const { urls, failed, firstError } = await uploadPhotos(createdService.id)
      if (urls.length > 0) {
        const { data: updatedService } = await supabase
          .from('services')
          .update({ photos: urls })
          .eq('id', createdService.id)
          .select()
          .single()
        serviceForRoute = updatedService || { ...createdService, photos: urls }
      }
      if (failed > 0) {
        Alert.alert('Some photos did not upload', firstError || `${failed} photo${failed === 1 ? '' : 's'} could not be uploaded.`)
      }
    }

    setSubmitting(false)
    Alert.alert(isEditing ? 'Service updated!' : 'Service published!', isEditing ? 'Your service has been updated.' : 'Your service is now live.', [
      { text: 'OK', onPress: () => isEditing ? navigation.goBack() : navigation.navigate('MyServices', { createdService: serviceForRoute }) },
    ])
  }

  function renderProgress() {
    return (
      <View style={styles.progressWrap}>
        {[1, 2, 3, 4, 5, 6].map(s => (
          <View key={s} style={[styles.progressPill, s <= step && styles.progressPillActive]} />
        ))}
      </View>
    )
  }

  function renderStep1() {
    return (
      <>
        <Text style={styles.stepHeading}>What service can you offer?</Text>

        <Text style={styles.fieldLabel}>Service title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Tractor topping with operator"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          accessibilityLabel="Service title"
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
              accessibilityRole="button"
              accessibilityState={{ selected: category === cat }}>
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </>
    )
  }

  function renderStep2() {
    return (
      <>
        <Text style={styles.stepHeading}>Add a short description</Text>

        <Text style={styles.fieldLabel}>Description <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="What is included, what gear you use, and what area you cover..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          autoCapitalize="sentences"
          accessibilityLabel="Service description"
        />

        <Text style={styles.fieldLabel}>Photos <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.photoGrid}>
          {photos.map((photo, idx) => (
            <View key={`${getPhotoUri(photo)}-${idx}`} style={styles.photoThumb}>
              <Image source={{ uri: getPhotoUri(photo) }} style={styles.photoImg} />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${idx + 1}`}>
                <Text style={styles.photoRemoveText}>x</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 4 && (
            <TouchableOpacity
              style={styles.photoAdd}
              onPress={pickPhoto}
              accessibilityRole="button"
              accessibilityLabel="Choose service photo">
              <Text style={styles.photoAddText}>Choose photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    )
  }

  function renderStep3() {
    return (
      <>
        <Text style={styles.stepHeading}>How is it priced?</Text>

        <Text style={styles.fieldLabel}>Pricing</Text>
        <View style={styles.segmentGrid}>
          {PRICING_TYPES.map(pt => (
            <TouchableOpacity
              key={pt.id}
              style={[styles.segmentBtn, pricingType === pt.id && styles.segmentBtnActive]}
              onPress={() => setPricingType(pt.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: pricingType === pt.id }}>
              <Text style={[styles.segmentText, pricingType === pt.id && styles.segmentTextActive]}>{pt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.inlineRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Rate</Text>
            <TextInput
              style={styles.input}
              placeholder="120"
              placeholderTextColor={colors.textMuted}
              value={rate}
              onChangeText={setRate}
              keyboardType="numeric"
              accessibilityLabel="Rate in NZD"
            />
          </View>
          {pricingType === 'per_unit' && (
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Unit</Text>
              <TextInput
                style={styles.input}
                placeholder="trough"
                placeholderTextColor={colors.textMuted}
                value={unitLabel}
                onChangeText={setUnitLabel}
                autoCapitalize="none"
                accessibilityLabel="Unit label"
              />
            </View>
          )}
        </View>

      </>
    )
  }

  function renderStep4() {
    return (
      <>
        <Text style={styles.stepHeading}>Where is it available?</Text>

        <Text style={styles.fieldLabel}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Hawke's Bay"
          placeholderTextColor={colors.textMuted}
          value={locationName}
          onChangeText={setLocationName}
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Location"
        />

        <Text style={styles.fieldLabel}>Travel range <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 50 km"
          placeholderTextColor={colors.textMuted}
          value={travelRange}
          onChangeText={setTravelRange}
          keyboardType="numeric"
          accessibilityLabel="Travel range in kilometres"
        />

        <Text style={styles.fieldLabel}>Available from <Text style={styles.optional}>(optional)</Text></Text>
        <TouchableOpacity
          style={styles.datePickerBtn}
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Select available from date">
          <Text style={availableFrom ? styles.datePickerValue : styles.datePickerPlaceholder}>
            {availableFrom ? formatDisplayDate(availableFrom) : 'Available now'}
          </Text>
          <Text style={styles.datePickerIcon}>📅</Text>
        </TouchableOpacity>
        {availableFrom && (
          <TouchableOpacity onPress={() => setAvailableFrom(null)} style={styles.clearDateBtn}>
            <Text style={styles.clearDateText}>Clear date</Text>
          </TouchableOpacity>
        )}
        {showDatePicker && (
          <>
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </TouchableOpacity>
            )}
            <DateTimePicker
              value={availableFrom || new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(event, selected) => {
                if (Platform.OS === 'android') setShowDatePicker(false)
                if (selected) setAvailableFrom(selected)
              }}
            />
          </>
        )}

      </>
    )
  }

  function renderStep5() {
    return (
      <>
        <Text style={styles.stepHeading}>Is equipment included?</Text>

        <Text style={styles.fieldLabel}>Equipment</Text>
        <View style={styles.segmentGrid}>
          <TouchableOpacity
            style={[styles.segmentBtn, !includesEquipment && styles.segmentBtnActive]}
            onPress={() => setIncludesEquipment(false)}
            accessibilityRole="button"
            accessibilityState={{ selected: !includesEquipment }}>
            <Text style={[styles.segmentText, !includesEquipment && styles.segmentTextActive]}>Labour only</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, includesEquipment && styles.segmentBtnActive]}
            onPress={() => setIncludesEquipment(true)}
            accessibilityRole="button"
            accessibilityState={{ selected: includesEquipment }}>
            <Text style={[styles.segmentText, includesEquipment && styles.segmentTextActive]}>Equipment included</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  function renderStep6() {
    const rows = [
      { label: 'Service', value: title },
      { label: 'Category', value: category },
      { label: 'Rate', value: formatRate() },
      { label: 'Location', value: locationName },
      travelRange && { label: 'Travel', value: `${travelRange} km` },
      { label: 'Equipment', value: includesEquipment ? 'Included' : 'Not included' },
      availableFrom && { label: 'Available', value: formatDisplayDate(availableFrom) },
      photos.length > 0 && { label: 'Photos', value: `${photos.length} photo${photos.length === 1 ? '' : 's'}` },
    ].filter(Boolean)

    return (
      <>
        <Text style={styles.stepHeading}>Ready to publish?</Text>
        <View style={styles.reviewCard}>
          {rows.map((row, i) => (
            <View key={row.label} style={[styles.reviewRow, i < rows.length - 1 && styles.reviewRowBorder]}>
              <Text style={styles.reviewLabel}>{row.label}</Text>
              <Text style={styles.reviewValue} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
        </View>
        {!!description && (
          <View style={styles.descCard}>
            <Text style={styles.reviewLabel}>Description</Text>
            <Text style={styles.descText}>{description}</Text>
          </View>
        )}
      </>
    )
  }

  const RENDERERS = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6]

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back">
          <Text style={styles.headerBackBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>DIFM Rural</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">{isEditing ? 'Edit service' : 'Advertise a service'}</Text>
        <Text style={styles.headerSub}>{STEP_LABELS[step - 1]}</Text>
        {renderProgress()}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: stepTranslateX }] }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            {RENDERERS[step - 1]()}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {step === 1 ? (
          <TouchableOpacity
            style={[styles.nextBtnFull, !canProceed() && styles.btnDisabled]}
            onPress={() => animateStep(2, 'forward')}
            disabled={!canProceed()}
            accessibilityRole="button"
            accessibilityLabel="Next step">
            <Text style={styles.nextBtnText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => animateStep(step - 1, 'backward')}
              accessibilityRole="button"
              accessibilityLabel="Previous step">
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            {step < 6 ? (
              <TouchableOpacity
                style={[styles.nextBtn, !canProceed() && styles.btnDisabled]}
                onPress={() => animateStep(step + 1, 'forward')}
                disabled={!canProceed()}
                accessibilityRole="button"
                accessibilityLabel="Next step">
                <Text style={styles.nextBtnText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.nextBtn, submitting && styles.btnDisabled]}
                onPress={handlePublish}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Publish service">
                <Text style={styles.nextBtnText}>{submitting ? 'Saving...' : isEditing ? 'Save' : 'Publish'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.background },
  headerBackBtn: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 4 },
  headerBackBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary, letterSpacing: 0 },
  headerSub: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 8, marginBottom: 14 },
  progressWrap: { flexDirection: 'row', gap: 8 },
  progressPill: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border },
  progressPillActive: { backgroundColor: colors.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28 },
  stepHeading: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.textPrimary, marginBottom: 16, letterSpacing: 0 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, marginTop: 14 },
  optional: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  input: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: 82, height: 82, borderRadius: 12, position: 'relative' },
  photoImg: { width: 82, height: 82, borderRadius: 12, backgroundColor: colors.border },
  photoRemove: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: colors.white, fontSize: 14, fontWeight: '700', lineHeight: 16 },
  photoAdd: {
    width: 116,
    height: 82,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  photoAddText: { fontSize: 13, color: colors.primary, fontWeight: '700', textAlign: 'center' },
  segmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmentBtn: {
    flexGrow: 1,
    minWidth: '47%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: colors.white },
  inlineRow: { flexDirection: 'row', gap: 10 },
  reviewCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 16, alignItems: 'flex-start' },
  reviewRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  reviewLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '700', width: 88, flexShrink: 0 },
  reviewValue: { fontSize: 14, color: colors.textPrimary, flex: 1, fontWeight: '600', textAlign: 'right' },
  descCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 12 },
  descText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, marginTop: 8 },
  footer: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, padding: 16 },
  footerRow: { flexDirection: 'row', gap: 12 },
  backBtn: { paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  nextBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  nextBtnFull: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  nextBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  btnDisabled: { backgroundColor: '#a8cfc0' },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
  },
  datePickerValue:       { fontSize: 16, color: colors.textPrimary, flex: 1 },
  datePickerPlaceholder: { fontSize: 16, color: colors.textMuted, flex: 1 },
  datePickerIcon:        { fontSize: 18, marginLeft: 8 },
  pickerDoneBtn:         { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  pickerDoneText:        { fontSize: 16, fontWeight: '600', color: colors.primary },
  clearDateBtn:          { marginTop: 6, paddingVertical: 4 },
  clearDateText:         { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
})
